import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sponsorInvitations, teams, clubs } from "@/lib/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getServerSession } from "@/lib/auth/session";

export const metadata = { title: "Einladung · KickPact" };

export default async function InvitationPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [invitation] = await db
    .select({
      id: sponsorInvitations.id,
      status: sponsorInvitations.status,
      teamName: teams.name,
      clubName: clubs.name,
      clubSlug: clubs.slug
    })
    .from(sponsorInvitations)
    .innerJoin(teams, eq(sponsorInvitations.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(sponsorInvitations.token, token))
    .limit(1);

  if (!invitation) {
    return (
      <main className="mx-auto max-w-md px-5 md:px-6 py-10 md:py-16">
        <Card className="border-brand-neutral/40">
          <CardHeader>
            <CardTitle className="font-display font-black text-2xl tracking-tight text-brand-night-navy">
              Einladung ungültig
            </CardTitle>
            <CardDescription className="text-brand-night-navy/60">
              Dieser Link existiert nicht oder ist abgelaufen.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/">Zurück zur Startseite</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if (invitation.status === "revoked") {
    return (
      <main className="mx-auto max-w-md px-5 md:px-6 py-10 md:py-16">
        <Card className="border-brand-neutral/40">
          <CardHeader>
            <CardTitle className="font-display font-black text-2xl tracking-tight text-brand-night-navy">
              Einladung zurückgezogen
            </CardTitle>
            <CardDescription className="text-brand-night-navy/60">
              Der Verein hat diesen Link deaktiviert. Frag nach einem neuen.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const session = await getServerSession();
  const isLoggedIn = !!session?.user;

  return (
    <main className="mx-auto max-w-2xl px-5 md:px-6 py-10 md:py-16">
      <div className="text-center">
        <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-[0.65rem] md:text-xs font-semibold uppercase tracking-[0.15em] text-accent-dark">
          Sponsor-Einladung
        </span>
        <h1 className="mt-4 md:mt-6 font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy break-words">
          {invitation.clubName}
        </h1>
        <p className="mt-1.5 md:mt-2 text-sm md:text-base text-brand-night-navy/60">
          lädt dich ein, die <strong className="text-brand-night-navy">{invitation.teamName}</strong> zu unterstützen.
        </p>
      </div>

      <Card className="mt-6 md:mt-10 border-brand-neutral/40">
        <CardContent className="pt-5 md:pt-6">
          <p className="text-sm text-brand-night-navy/80 leading-relaxed">
            Lege einen Pledge an — z.B. <em>5 € pro Tor</em> oder <em>10 € pro Sieg</em>. Du
            zahlst nur, wenn die Mannschaft auch wirklich performt. Am Monatsende bekommst
            du eine Rechnung vom Verein über das, was tatsächlich zusammenkam.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 text-xs">
            <Feature icon="✅" text="Cap pro Monat möglich" />
            <Feature icon="🛡️" text="Spezial-Events zur Bestätigung" />
            <Feature icon="📄" text="Steuerlich absetzbar" />
            <Feature icon="🚪" text="Jederzeit kündbar" />
          </div>
          <div className="mt-8">
            <Button variant="accent" size="lg" className="w-full" asChild>
              <Link
                href={
                  isLoggedIn
                    ? `/sponsor/pledge/new?invitation=${token}`
                    : `/login?invitation=${token}`
                }
              >
                {isLoggedIn ? "Pledge anlegen →" : "Login / Account anlegen →"}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <p className="mt-8 text-center text-xs text-brand-night-navy/50">
        Mit Klick auf den Login akzeptierst du Datenschutz + AGB.
      </p>
    </main>
  );
}

function Feature({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-brand-neutral/40 bg-brand-off-white p-2.5">
      <span className="text-base">{icon}</span>
      <span className="text-brand-night-navy/80">{text}</span>
    </div>
  );
}
