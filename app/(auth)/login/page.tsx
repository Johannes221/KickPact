import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAppleConfigured } from "@/lib/auth/apple-client-secret";
import { getServerSession } from "@/lib/auth/session";

export const metadata = { title: "Login · KickPact" };

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

  // Google blockt OAuth in eingebetteten WebViews ("disallowed_useragent") →
  // in der nativen App ausblenden, bis ein nativer Google-Flow existiert.
  // Apple läuft nativ (WS-3), Magic-Link bleibt als Mail-Weg.
  const isNativeApp = ((await headers()).get("user-agent") ?? "").includes("KickPactApp");
  const oauthEnabled = {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) && !isNativeApp,
    apple: isAppleConfigured()
  };
  const anyOauth = oauthEnabled.google || oauthEnabled.apple;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col justify-center px-6 pb-safe pt-safe">
      {/* Markenanker oben statt Leerraum — gibt dem Screen Halt, Card sitzt mittig. */}
      <div className="mb-7 flex flex-col items-center text-center">
        <Image
          src="/brand/logo-navy-horizontal.png"
          alt="KickPact"
          width={168}
          height={22}
          className="h-6 w-auto"
          priority
        />
        <p className="mt-3 text-sm font-medium text-brand-night-navy/45">
          Performance-Sponsoring für deinen Verein
        </p>
      </div>
      <Card className="border-brand-neutral/40 shadow-[0_24px_60px_-28px_rgba(10,22,44,0.22)]">
        <CardHeader>
          <CardTitle className="font-display text-3xl tracking-wide">Login</CardTitle>
          <CardDescription>Einloggen per Magic-Link oder mit deinem Account.</CardDescription>
        </CardHeader>
        <CardContent>
          {anyOauth && (
            <>
              <Suspense fallback={<div className="h-20" />}>
                <OAuthButtons mode="login" enabled={oauthEnabled} />
              </Suspense>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-neutral-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-wider">
                  <span className="bg-white px-2 text-neutral-500">oder per Mail</span>
                </div>
              </div>
            </>
          )}
          <Suspense fallback={<div className="h-32" />}>
            <MagicLinkForm mode="login" />
          </Suspense>
          <p className="mt-6 text-sm text-neutral-500">
            Noch keinen Account?{" "}
            <Link href="/signup" className="font-medium text-accent hover:underline">
              Account anlegen
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
