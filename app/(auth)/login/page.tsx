import { Suspense } from "react";
import Link from "next/link";
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
  searchParams: Promise<{ invitation?: string }>;
}) {
  const { invitation } = await searchParams;

  // ── Auth-aware: eingeloggter User landet direkt im Dashboard-Dispatcher ──
  const session = await getServerSession();
  if (session?.user) {
    // Mit Einladungs-Token: direkt in den Pledge-Wizard, damit das Sponsor-
    // Onboarding aus einem Einladungs-Link nicht verloren geht.
    if (invitation) {
      redirect(`/sponsor/pledge/new?invitation=${invitation}`);
    }
    redirect("/dashboard");
  }

  const oauthEnabled = {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    apple: isAppleConfigured()
  };
  const anyOauth = oauthEnabled.google || oauthEnabled.apple;

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Card>
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
