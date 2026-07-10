import { Suspense } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAppleConfigured } from "@/lib/auth/apple-client-secret";
import { getServerSession } from "@/lib/auth/session";

export const metadata = { title: "Anmelden · KickPact" };

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ invitation?: string; "team-invite"?: string }>;
}) {
  const params = await searchParams;
  const invitation = params.invitation;
  const teamInvite = params["team-invite"];

  // ── Auth-aware: eingeloggter User landet direkt im Dashboard-Dispatcher ──
  const session = await getServerSession();
  if (session?.user) {
    // Team-Einladung (Trainer/Viewer) hat Vorrang — direkt zur Accept-Page.
    if (teamInvite) {
      redirect(`/team-einladung/${teamInvite}`);
    }
    // Mit Sponsor-Einladungs-Token: direkt in den Pledge-Wizard, damit das
    // Sponsor-Onboarding aus einem Einladungs-Link nicht verloren geht.
    if (invitation) {
      redirect(`/sponsor/pledge/new?invitation=${invitation}`);
    }
    redirect("/dashboard");
  }

  // Google: in der nativen App über das @codetrix-GoogleAuth-Plugin
  // (iosClientId aus capacitor.config — kein Web-Env nötig); im Web nur mit
  // Web-OAuth-Creds. Apple läuft in der App über den NATIVEN Sign-in-Flow
  // (`SignInWithApple.authorize`, braucht nur das Entitlement, KEIN Web-Secret)
  // → in der App immer anbieten, sonst zeigt die App Google ohne Apple = 4.8-
  // Reject und Apple-Nutzer kommen nicht rein, wenn das 6-Monats-JWT abläuft.
  const isNativeApp = ((await headers()).get("user-agent") ?? "").includes("KickPactApp");
  const oauthEnabled = {
    google: isNativeApp
      ? true
      : Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    apple: isNativeApp ? true : isAppleConfigured()
  };
  const anyOauth = oauthEnabled.google || oauthEnabled.apple;

  return (
    <main className="mx-auto w-full max-w-md px-6 pb-16 pt-4">
      <Card className="border-brand-neutral/25 shadow-[0_24px_60px_-24px_rgba(26,26,46,0.25)]">
        <CardHeader className="space-y-1.5">
          <CardTitle className="text-[26px] font-bold tracking-tight text-brand-night-navy">
            Anmelden
          </CardTitle>
          <CardDescription className="text-[15px] text-brand-night-navy/55">
            {isNativeApp
              ? "Weiter mit Apple oder Google."
              : "Weiter mit Apple, Google oder per Magic-Link."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {anyOauth && (
            <>
              <Suspense fallback={<div className="h-20" />}>
                <OAuthButtons mode="login" enabled={oauthEnabled} />
              </Suspense>
              {/* Magic-Link nur im Web: in der iOS-App öffnet der Mail-Link in
                  Safari, das Session-Cookie landet in Safaris Jar und die
                  WKWebView bleibt ausgeloggt (getrennter WKWebsiteDataStore).
                  In der App führen nur Apple/Google (nativer Flow) rein. */}
              {!isNativeApp && (
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-ios-separator" />
                  </div>
                  <div className="relative flex justify-center text-[12px] font-medium uppercase tracking-[0.08em]">
                    <span className="bg-white px-3 text-ios-label-tertiary">oder per Mail</span>
                  </div>
                </div>
              )}
            </>
          )}
          {!isNativeApp && (
            <Suspense fallback={<div className="h-32" />}>
              <MagicLinkForm mode="login" />
            </Suspense>
          )}

          {/* Registrieren — eigener, klar sichtbarer Weg statt versteckter Link. */}
          <Link
            href="/signup"
            className="press mt-6 flex items-center justify-between gap-3 rounded-xl bg-ios-fill-tertiary px-4 py-3.5"
          >
            <span className="text-sm text-brand-night-navy/70">
              Noch kein Account?{" "}
              <span className="font-semibold text-brand-night-navy">Jetzt loslegen</span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-accent-dark" aria-hidden />
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
