"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { track } from "@/lib/analytics/track";
import { isNativeApp } from "@/lib/platform/native";

interface OAuthButtonsProps {
  /** Login → /dashboard (Smart-Dispatcher), Signup → wizard für `role`. */
  mode: "login" | "signup";
  /** Welche Provider verfügbar sind (Server-side bestimmt). */
  enabled: { google: boolean; apple: boolean };
  /**
   * Rolle aus dem `/signup?role=X`-Param. Bestimmt das OAuth-Callback-Ziel:
   *  - `sponsor` → `/sponsor/onboarding` (Sponsor-Profil-Wizard)
   *  - `mannschaft` → `/onboarding/mannschaft/verein` (Pro-Trial Wizard)
   *  - `verein` → `/onboarding/verein/verein` (Vereinslizenz-Trial Wizard)
   *  - undefined (z.B. login) → fallback `/dashboard`
   */
  role?: "mannschaft" | "verein" | "sponsor" | null;
}

/**
 * Google + Apple Sign-in-Buttons. Werden nur gerendert wenn die zugehörigen
 * Credentials in den Env-Vars hinterlegt sind (Server-prüfung in der parent
 * Page).
 *
 * Wichtig: Wenn ein Einladungs-Token (`?invitation=<token>`) in der URL
 * steht, wird der nach OAuth-Auth direkt ins Sponsor-Onboarding mitgeführt —
 * sonst landet der User auf einem leeren `/sponsor` Dashboard ohne Profil.
 */
export function OAuthButtons({ mode, enabled, role }: OAuthButtonsProps) {
  const params = useSearchParams();
  const invitationToken = params.get("invitation");
  const [pending, setPending] = useState<"google" | "apple" | null>(null);

  if (!enabled.google && !enabled.apple) return null;

  // Auch der Signup-Flow läuft über den /dashboard-Dispatcher: ein returning
  // Apple-/Google-User (Identity existiert bereits) würde sonst trotzdem im
  // Anlegen-Wizard stranden, weil OAuth nicht zwischen Login und Signup
  // unterscheiden kann. Der `role`-Hint greift im Dispatcher NUR für 0-Identity-
  // User (echter Erst-Signup) und wird bei bestehender Identity ignoriert.
  const callbackURL = invitationToken
    ? `/sponsor/onboarding?invitation=${invitationToken}`
    : mode === "signup" && role
      ? `/dashboard?role=${role}`
      : "/dashboard"; // rollenbasiert weiterleiten

  async function handleSocial(provider: "google" | "apple") {
    setPending(provider);
    // Conversion-Event vor dem OAuth-Redirect — der Provider-Roundtrip
    // verlässt die App, also kein post-click-Track mehr möglich.
    if (mode === "signup") {
      track("signup_started", {
        method: provider,
        ...(role ? { role } : {})
      });
    }
    try {
      // Native iOS-App: Google-Login über das native GoogleSignIn-Sheet statt
      // Web-OAuth (Google blockt OAuth in WebViews → „403 disallowed_useragent").
      // Das native idToken (aud = iOS-Client-ID) geht direkt an better-auth, das
      // serverseitig sowohl die iOS- als auch die Web-Client-ID als Audience
      // akzeptiert (googleVerifyIdToken in lib/auth/server.ts).
      if (provider === "google" && isNativeApp()) {
        const { GoogleAuth } = await import(
          "@codetrix-studio/capacitor-google-auth"
        );
        const result = await GoogleAuth.signIn();
        const token = result.authentication?.idToken;
        if (!token) throw new Error("Kein Google-Identity-Token erhalten");
        const { error } = await signIn.social({
          provider: "google",
          idToken: { token }
        });
        if (error) throw new Error(error.message ?? "Google-Login fehlgeschlagen");
        window.location.assign(callbackURL);
        return;
      }
      // Native iOS-App: Apple-Login über das native Sheet (ASAuthorization)
      // statt Web-OAuth (das im WKWebView nach Safari springen würde, WS-3).
      // Das native identityToken geht direkt an better-auth (Audience-Check
      // gegen APPLE_BUNDLE_ID=com.kickpact.app serverseitig).
      if (provider === "apple" && isNativeApp()) {
        const { SignInWithApple } = await import("@capacitor-community/apple-sign-in");
        const result = await SignInWithApple.authorize({
          clientId: "com.kickpact.app",
          redirectURI: `${window.location.origin}/api/auth/callback/apple`,
          scopes: "name email"
        });
        const token = result.response.identityToken;
        if (!token) throw new Error("Kein Apple-Identity-Token erhalten");
        const { error } = await signIn.social({ provider: "apple", idToken: { token } });
        if (error) throw new Error(error.message ?? "Apple-Login fehlgeschlagen");
        window.location.assign(callbackURL);
        return;
      }
      await signIn.social({ provider, callbackURL });
      // signIn.social löst Browser-Redirect zu Provider aus,
      // die nächste Zeile wird nur erreicht wenn etwas schiefgeht.
    } catch (e) {
      console.error(`[oauth] ${provider} sign-in failed`, e);
      toast.error(`${provider === "google" ? "Google" : "Apple"}-Login fehlgeschlagen`);
      setPending(null);
    }
  }

  return (
    <div className="space-y-2">
      {enabled.google && (
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="press w-full"
          disabled={pending !== null}
          onClick={() => handleSocial("google")}
        >
          <GoogleIcon className="h-[18px] w-[18px]" />
          {pending === "google" ? "Verbinde mit Google..." : "Mit Google fortfahren"}
        </Button>
      )}
      {enabled.apple && (
        <Button
          type="button"
          variant="dark"
          size="lg"
          className="press w-full"
          disabled={pending !== null}
          onClick={() => handleSocial("apple")}
        >
          <AppleIcon className="h-[18px] w-[18px]" />
          {pending === "apple" ? "Verbinde mit Apple..." : "Mit Apple fortfahren"}
        </Button>
      )}
    </div>
  );
}

/**
 * Offizielles 4-farbiges Google-„G" (Google Identity Branding Guidelines).
 * Einfarbige G-Logos sind laut Google nicht erlaubt — nur das Vollfarb-Logo
 * oder die genehmigte White/Neutral-Variante.
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

/**
 * Apple-Logo (currentColor → erbt die weiße Schriftfarbe des Dark-Buttons).
 * Optisch um ~1px nach oben verschoben, weil das Apfel-Blatt sonst gegenüber
 * der Textlinie tief wirkt (Apple HIG: Logo vertikal zur Cap-Height zentriert).
 */
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
