import { Suspense } from "react";
import Link from "next/link";
import { MagicLinkForm, type SignupRole } from "@/components/auth/magic-link-form";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isAppleConfigured } from "@/lib/auth/apple-client-secret";

export const metadata = { title: "Bei KickPact starten · KickPact" };

const ROLE_META: Record<
  SignupRole,
  { emoji: string; title: string; tagline: string; bullets: string[] }
> = {
  mannschaft: {
    emoji: "⚽",
    title: "Als Mannschaft",
    tagline:
      "Du willst Sponsoring für eine einzelne Mannschaft — Sponsoren versprechen pro Tor, Sieg, Comeback. Geld direkt in eure Kasse.",
    bullets: [
      "Onboarding in 90 Sek. — wir finden euch auf Fußball.de",
      "Einladungslink → Sponsoren legen Pledges selbst fest",
      "30 Tage gratis, danach 9 € / Mon."
    ]
  },
  verein: {
    emoji: "🏟️",
    title: "Als Verein",
    tagline:
      "Du repräsentierst einen ganzen Verein mit mehreren Mannschaften. Du wählst die Vereinslizenz im Plan-Schritt.",
    bullets: [
      "Mehrere Mannschaften unter einem Dach",
      "Vereinslogo auf PDF-Rechnungen, CSV-Export",
      "Per Mannschaft buchbar — Teams einzeln aktivieren"
    ]
  },
  sponsor: {
    emoji: "💚",
    title: "Als Sponsor",
    tagline:
      "Du willst eine Mannschaft unterstützen — pro Tor, pro Sieg, pro Comeback. Du behältst die Kontrolle mit optionalem Cap.",
    bullets: [
      "Frei wählbare Pledges — von 1 € pro Tor bis 50 € pro Sieg",
      "100 % geht an die Mannschaft — wir zwacken nichts ab",
      "Du brauchst keinen Einladungslink, kannst aber einen verwenden"
    ]
  }
};

function isSignupRole(v: string | undefined): v is SignupRole {
  return v === "mannschaft" || v === "verein" || v === "sponsor";
}

export default async function SignupPage({
  searchParams
}: {
  searchParams: Promise<{ role?: string }>;
}) {
  const { role: roleParam } = await searchParams;
  const role = isSignupRole(roleParam) ? roleParam : null;

  const oauthEnabled = {
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    apple: isAppleConfigured()
  };
  const anyOauth = oauthEnabled.google || oauthEnabled.apple;

  // Kein Role-Param → 3-Wege-Chooser anzeigen
  if (!role) {
    return (
      <main className="mx-auto max-w-4xl px-5 md:px-6 py-12 md:py-16">
        <div className="mb-8 md:mb-10 text-center">
          <h1 className="font-display font-black text-3xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
            Bei KickPact starten
          </h1>
          <p className="mt-2 md:mt-3 text-sm md:text-base text-brand-night-navy/60 max-w-xl mx-auto">
            Wähle, wie du KickPact nutzen willst. Du kannst später jederzeit eine weitere Rolle
            hinzufügen.
          </p>
        </div>

        <div className="grid gap-4 md:gap-5 md:grid-cols-3">
          {(["mannschaft", "verein", "sponsor"] as const).map((r) => {
            const meta = ROLE_META[r];
            return (
              <Link
                key={r}
                href={`/signup?role=${r}`}
                className="group flex flex-col gap-4 rounded-2xl border border-brand-neutral/40 bg-white p-6 transition-all hover:border-accent hover:shadow-md"
              >
                <div className="text-4xl">{meta.emoji}</div>
                <div>
                  <h2 className="font-display font-black text-xl tracking-tight text-brand-night-navy">
                    {meta.title}
                  </h2>
                  <p className="mt-2 text-sm text-brand-night-navy/60 leading-relaxed">
                    {meta.tagline}
                  </p>
                </div>
                <ul className="mt-auto space-y-1.5 text-xs text-brand-night-navy/70">
                  {meta.bullets.map((b) => (
                    <li key={b} className="flex gap-2">
                      <span className="text-accent mt-0.5">·</span>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 inline-flex items-center text-sm font-semibold text-accent group-hover:translate-x-0.5 transition-transform">
                  Weiter →
                </div>
              </Link>
            );
          })}
        </div>

        <p className="mt-8 text-center text-sm text-brand-night-navy/60">
          Schon einen Account?{" "}
          <Link href="/login" className="font-medium text-accent hover:underline">
            Login
          </Link>
        </p>
      </main>
    );
  }

  // Role gewählt → MagicLinkForm + OAuth mit passendem Kontext
  const meta = ROLE_META[role];
  return (
    <main className="mx-auto max-w-md px-6 py-12 md:py-16">
      <div className="mb-2">
        <Link
          href="/signup"
          className="text-xs text-brand-night-navy/50 hover:text-brand-night-navy"
        >
          ← Andere Rolle wählen
        </Link>
      </div>
      <Card>
        <CardHeader>
          <div className="text-3xl mb-1">{meta.emoji}</div>
          <CardTitle className="font-display text-2xl md:text-3xl tracking-wide">
            {meta.title} registrieren
          </CardTitle>
          <CardDescription>{meta.tagline}</CardDescription>
        </CardHeader>
        <CardContent>
          {anyOauth && (
            <>
              <Suspense fallback={<div className="h-20" />}>
                <OAuthButtons mode="signup" enabled={oauthEnabled} />
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
            <MagicLinkForm mode="signup" role={role} />
          </Suspense>
          <p className="mt-6 text-sm text-neutral-500">
            Schon dabei?{" "}
            <Link href="/login" className="font-medium text-accent hover:underline">
              Login
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
