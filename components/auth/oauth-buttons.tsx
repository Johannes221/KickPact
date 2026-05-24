"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { track } from "@/lib/analytics/track";

interface OAuthButtonsProps {
  /** Login → /dashboard (Smart-Dispatcher), Signup → wizard für `role`. */
  mode: "login" | "signup";
  /** Welche Provider verfügbar sind (Server-side bestimmt). */
  enabled: { google: boolean; apple: boolean };
  /**
   * Rolle aus dem `/signup?role=X`-Param. Bestimmt das OAuth-Callback-Ziel:
   *  - `sponsor` → `/sponsor/onboarding` (Sponsor-Profil-Wizard)
   *  - `mannschaft` / `verein` → `/onboarding/verein/1`
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

  const callbackURL = invitationToken
    ? `/sponsor/onboarding?invitation=${invitationToken}`
    : mode === "signup"
      ? role === "sponsor"
        ? "/sponsor/onboarding"
        : "/onboarding/verein/1"
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
          className="w-full"
          disabled={pending !== null}
          onClick={() => handleSocial("google")}
        >
          <GoogleIcon className="mr-2 h-4 w-4" />
          {pending === "google" ? "Verbinde mit Google..." : "Mit Google fortfahren"}
        </Button>
      )}
      {enabled.apple && (
        <Button
          type="button"
          variant="outline"
          className="w-full bg-black text-white hover:bg-black/90 hover:text-white border-black"
          disabled={pending !== null}
          onClick={() => handleSocial("apple")}
        >
          <AppleIcon className="mr-2 h-4 w-4" />
          {pending === "apple" ? "Verbinde mit Apple..." : "Mit Apple fortfahren"}
        </Button>
      )}
    </div>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.5-1.7 4.4-5.5 4.4-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.7 14.7 2.8 12 2.8 6.9 2.8 2.8 6.9 2.8 12s4.1 9.2 9.2 9.2c5.3 0 8.8-3.7 8.8-9 0-.6-.1-1.1-.2-1.6H12z"
      />
    </svg>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M16.365 1.43c0 1.14-.46 2.23-1.21 3.03-.81.85-2.13 1.51-3.21 1.42-.13-1.11.41-2.27 1.13-3.03.83-.87 2.24-1.51 3.29-1.42zM20.55 17.13c-.42 1-.93 1.95-1.55 2.84-.85 1.21-1.55 2.05-2.08 2.52-.83.73-1.72 1.1-2.67 1.12-.69.02-1.51-.18-2.47-.59-.96-.41-1.84-.62-2.65-.62-.85 0-1.76.21-2.74.62-.98.41-1.77.62-2.37.65-.91.04-1.82-.34-2.72-1.13-.57-.52-1.31-1.39-2.21-2.62C1.36 18.5.66 17 .17 15.39c-.51-1.69-.77-3.34-.77-4.94 0-1.83.4-3.4 1.19-4.71.62-1.06 1.45-1.89 2.49-2.51A6.69 6.69 0 0 1 6.45 2.24c.74 0 1.7.23 2.89.68 1.19.46 1.95.69 2.28.69.25 0 1.1-.27 2.55-.81 1.37-.5 2.53-.71 3.48-.63 2.58.21 4.51 1.22 5.79 3.05-2.31 1.4-3.45 3.36-3.43 5.89.02 1.97.74 3.61 2.16 4.92.64.6 1.36 1.06 2.16 1.39-.17.5-.36.99-.58 1.47z" />
    </svg>
  );
}
