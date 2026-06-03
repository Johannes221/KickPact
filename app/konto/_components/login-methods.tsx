"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { isNativeApp } from "@/lib/platform/native";

/**
 * iOS-OAuth-Client-ID (aud des nativen Google-idTokens). Muss identisch sein zu
 * `GoogleAuth.iosClientId` in `capacitor.config.ts` und dem Wert in
 * `components/auth/oauth-buttons.tsx` — der Backend-Verify akzeptiert sowohl die
 * Web- als auch die iOS-Audience (googleVerifyIdToken in lib/auth/server.ts).
 */
const GOOGLE_IOS_CLIENT_ID =
  "61970500774-vndgkcbi8073g8hk91jsb9rml1747nn9.apps.googleusercontent.com";

let googleInitPromise: Promise<void> | null = null;

/**
 * Echter Capacitor-Bridge-Check (NICHT der UA-Fallback aus `isNativeApp()`).
 * Ein nativer Plugin-Call ohne verfügbare Bridge crasht nativ (force-unwrap) —
 * siehe ausführliche Begründung in components/auth/oauth-buttons.tsx.
 */
function hasCapacitorBridge(): boolean {
  if (typeof window === "undefined") return false;
  return window.Capacitor?.isNativePlatform?.() === true;
}

type LinkableProvider = "apple" | "google";

const PROVIDER_LABEL: Record<LinkableProvider, string> = {
  apple: "Apple",
  google: "Google"
};

export interface LoginMethodsProps {
  /**
   * Provider, die bereits mit diesem Account verknüpft sind (aus der
   * better-auth `accounts`-Tabelle). Enthält neben Social-Providern ggf.
   * `credential` (E-Mail/Magic-Link) — wird hier nur fürs Anzeigen genutzt.
   */
  linkedProviderIds: string[];
  /**
   * Social-Provider, die auf diesem Deployment konfiguriert sind (Credentials
   * gesetzt). Nur für diese werden „Verknüpfen"-Buttons angeboten.
   */
  configuredProviders: LinkableProvider[];
}

/**
 * „Anmeldemethoden"-Sektion in /konto. Erlaubt einem eingeloggten Nutzer, seine
 * Apple-/Google-Identität an den bestehenden Account anzuhängen — der zentrale
 * Hebel gegen den Apple-Private-Relay-Fall: Login per Relay erzeugt sonst einen
 * NEUEN Account ohne Mannschaft. Nach dem Verknüpfen landen künftige Logins über
 * diese Identität im selben Account inkl. aller Rollen.
 *
 * Web: `authClient.linkSocial({ provider })` löst den OAuth-Redirect aus.
 * Native iOS: identisch zum Login wird das native Sheet genutzt und das idToken
 * direkt an better-auth `/link-social` geschickt (kein Safari-Sprung).
 */
export function LoginMethods({
  linkedProviderIds,
  configuredProviders
}: LoginMethodsProps) {
  const [pending, setPending] = useState<LinkableProvider | null>(null);

  const hasMagicLink = linkedProviderIds.includes("credential");

  async function handleLink(provider: LinkableProvider) {
    setPending(provider);
    try {
      // Native iOS: nativer Sheet-Flow → idToken direkt an /link-social.
      // Spiegelt den Login-Pfad aus oauth-buttons.tsx, vermeidet den Safari-
      // Sprung des Web-OAuth-Redirects im WKWebView.
      if (provider === "apple" && isNativeApp()) {
        const { SignInWithApple } = await import(
          "@capacitor-community/apple-sign-in"
        );
        const result = await SignInWithApple.authorize({
          clientId: "com.kickpact.app",
          redirectURI: `${window.location.origin}/api/auth/callback/apple`,
          scopes: "name email"
        });
        const token = result.response.identityToken;
        if (!token) throw new Error("Kein Apple-Identity-Token erhalten");
        const { error } = await authClient.linkSocial({
          provider: "apple",
          idToken: { token }
        });
        if (error) {
          throw new Error(error.message ?? "Verknüpfen fehlgeschlagen");
        }
        toast.success("Apple wurde mit deinem Konto verknüpft.");
        window.location.reload();
        return;
      }

      if (
        provider === "google" &&
        isNativeApp() &&
        hasCapacitorBridge()
      ) {
        const { GoogleAuth } = await import(
          "@codetrix-studio/capacitor-google-auth"
        );
        if (!googleInitPromise) {
          googleInitPromise = GoogleAuth.initialize({
            clientId: GOOGLE_IOS_CLIENT_ID,
            scopes: ["profile", "email"],
            grantOfflineAccess: true
          }).catch((err) => {
            googleInitPromise = null;
            throw err;
          });
        }
        await googleInitPromise;
        const result = await GoogleAuth.signIn();
        const token = result.authentication?.idToken;
        if (!token) throw new Error("Kein Google-Identity-Token erhalten");
        const { error } = await authClient.linkSocial({
          provider: "google",
          idToken: { token }
        });
        if (error) {
          throw new Error(error.message ?? "Verknüpfen fehlgeschlagen");
        }
        toast.success("Google wurde mit deinem Konto verknüpft.");
        window.location.reload();
        return;
      }

      // Web (und nicht-native Fallback): OAuth-Redirect zum Provider. Nach
      // erfolgreicher Verknüpfung kommt der User auf /konto zurück.
      await authClient.linkSocial({
        provider,
        callbackURL: "/konto"
      });
      // Bei Redirect-Flow wird die nächste Zeile nicht erreicht.
    } catch (e) {
      console.error(`[link-account] ${provider} link failed`, e);
      toast.error(
        `${PROVIDER_LABEL[provider]} konnte nicht verknüpft werden.`
      );
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      {/* E-Mail / Magic-Link — immer vorhanden, nicht entfernbar */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-neutral/30 bg-brand-off-white px-3 py-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <span aria-hidden className="text-base">
            ✉️
          </span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-brand-night-navy">
              E-Mail · Magic-Link
            </div>
            <div className="text-[0.7rem] text-brand-night-navy/55">
              Login per Link an deine E-Mail-Adresse
            </div>
          </div>
        </div>
        {hasMagicLink && (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-800">
            ✓ Aktiv
          </span>
        )}
      </div>

      {configuredProviders.map((provider) => {
        const isLinked = linkedProviderIds.includes(provider);
        return (
          <div
            key={provider}
            className="flex items-center justify-between gap-3 rounded-xl border border-brand-neutral/30 bg-brand-off-white px-3 py-2.5"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {provider === "apple" ? (
                <AppleIcon className="h-[18px] w-[18px] shrink-0 text-brand-night-navy" />
              ) : (
                <GoogleIcon className="h-[18px] w-[18px] shrink-0" />
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium text-brand-night-navy">
                  {PROVIDER_LABEL[provider]}
                </div>
                <div className="text-[0.7rem] text-brand-night-navy/55">
                  {isLinked
                    ? "Mit deinem Konto verknüpft"
                    : "Login über diese Methode hinzufügen"}
                </div>
              </div>
            </div>
            {isLinked ? (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-800">
                ✓ Verbunden
              </span>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={pending !== null}
                onClick={() => handleLink(provider)}
              >
                {pending === provider ? "Verknüpfe…" : "Verknüpfen"}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Offizielles 4-farbiges Google-„G" (Google Identity Branding Guidelines).
 * Spiegelt das Icon aus components/auth/oauth-buttons.tsx.
 */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

/** Apple-Logo (currentColor). Spiegelt das Icon aus oauth-buttons.tsx. */
function AppleIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M17.57 12.62c-.03-2.85 2.33-4.22 2.43-4.29-1.32-1.94-3.39-2.2-4.12-2.23-1.75-.18-3.42 1.03-4.31 1.03-.89 0-2.26-1.01-3.72-.98-1.91.03-3.68 1.11-4.66 2.82-1.99 3.45-.51 8.56 1.43 11.36.95 1.37 2.08 2.91 3.57 2.85 1.43-.06 1.97-.93 3.7-.93 1.73 0 2.21.93 3.72.9 1.54-.03 2.51-1.4 3.45-2.78 1.09-1.6 1.54-3.15 1.56-3.23-.03-.01-2.99-1.15-3.02-4.56zM14.72 4.18c.79-.96 1.32-2.29 1.18-3.62-1.14.05-2.52.76-3.34 1.72-.73.85-1.37 2.21-1.2 3.51 1.27.1 2.57-.65 3.36-1.61z" />
    </svg>
  );
}
