import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sponsorInvitations, teams, clubs } from "@/lib/db/schema";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getServerSession } from "@/lib/auth/session";
import { AcceptInviteButton } from "./_components/accept-button";

export const metadata = { title: "Team-Einladung · KickPact" };

const ROLE_LABEL: Record<"trainer" | "viewer", string> = {
  trainer: "Trainer",
  viewer: "Viewer"
};

const ROLE_DESC: Record<"trainer" | "viewer", string> = {
  trainer: "Du kannst Spiele, Events und Pacts pflegen.",
  viewer: "Du siehst alles, kannst aber nichts ändern."
};

export default async function TeamInvitationPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const [invitation] = await db
    .select({
      id: sponsorInvitations.id,
      status: sponsorInvitations.status,
      kind: sponsorInvitations.kind,
      role: sponsorInvitations.role,
      teamId: sponsorInvitations.teamId,
      clubId: sponsorInvitations.clubId,
      expiresAt: sponsorInvitations.expiresAt,
      recipientEmail: sponsorInvitations.recipientEmail,
      teamName: teams.name,
      clubName: clubs.name,
      clubSlug: clubs.slug
    })
    .from(sponsorInvitations)
    .leftJoin(teams, eq(sponsorInvitations.teamId, teams.id))
    .leftJoin(
      clubs,
      // Join über teams.clubId ODER direkt sponsorInvitations.clubId
      eq(clubs.id, sponsorInvitations.clubId)
    )
    .where(eq(sponsorInvitations.token, token))
    .limit(1);

  // Wenn Club nicht direkt geladen wurde, weil Invite via teams läuft → nachladen
  let clubName: string | null = invitation?.clubName ?? null;
  let clubSlug: string | null = invitation?.clubSlug ?? null;
  if (invitation && !clubName && invitation.teamId) {
    const [row] = await db
      .select({ name: clubs.name, slug: clubs.slug })
      .from(teams)
      .innerJoin(clubs, eq(teams.clubId, clubs.id))
      .where(eq(teams.id, invitation.teamId))
      .limit(1);
    clubName = row?.name ?? null;
    clubSlug = row?.slug ?? null;
  }

  if (!invitation || invitation.kind !== "team-member") {
    return (
      <main className="mx-auto max-w-md px-5 md:px-6 py-10 md:py-16">
        <Card className="border-brand-neutral/40">
          <CardHeader>
            <CardTitle className="font-display font-black text-2xl tracking-tight text-brand-night-navy">
              Einladung ungültig
            </CardTitle>
            <CardDescription className="text-brand-night-navy/60">
              Dieser Link existiert nicht oder gehört nicht zu einer Team-Einladung.
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

  if (invitation.status === "used") {
    return (
      <main className="mx-auto max-w-md px-5 md:px-6 py-10 md:py-16">
        <Card className="border-brand-neutral/40">
          <CardHeader>
            <CardTitle className="font-display font-black text-2xl tracking-tight text-brand-night-navy">
              Einladung bereits eingelöst
            </CardTitle>
            <CardDescription className="text-brand-night-navy/60">
              Dieser Link wurde schon verwendet. Wenn du Zugriff brauchst, frag
              den Verein-Admin nach einer neuen Einladung.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link href="/dashboard">Zum Dashboard</Link>
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

  if (invitation.expiresAt.getTime() < Date.now()) {
    return (
      <main className="mx-auto max-w-md px-5 md:px-6 py-10 md:py-16">
        <Card className="border-brand-neutral/40">
          <CardHeader>
            <CardTitle className="font-display font-black text-2xl tracking-tight text-brand-night-navy">
              Einladung abgelaufen
            </CardTitle>
            <CardDescription className="text-brand-night-navy/60">
              Dieser Link ist nach 30 Tagen abgelaufen. Frag den Verein-Admin
              nach einer neuen Einladung.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const role = invitation.role as "trainer" | "viewer" | null;
  const session = await getServerSession();
  const isLoggedIn = !!session?.user;

  const scopeLabel = invitation.teamId
    ? `Mannschaft ${invitation.teamName ?? "deines Vereins"}`
    : "deinen ganzen Verein";

  return (
    <main className="mx-auto max-w-2xl px-5 md:px-6 py-10 md:py-16">
      <div className="text-center">
        <span className="inline-flex items-center rounded-full bg-accent/10 px-3 py-1 text-[0.65rem] md:text-xs font-semibold uppercase tracking-[0.15em] text-accent-dark">
          Team-Einladung
        </span>
        <h1 className="mt-4 md:mt-6 font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy break-words">
          {clubName ?? "Ein Verein"}
        </h1>
        <p className="mt-2 md:mt-3 text-sm md:text-base text-brand-night-navy/60">
          lädt dich als{" "}
          <strong className="text-brand-night-navy">
            {role ? ROLE_LABEL[role] : "Mitglied"}
          </strong>{" "}
          in {scopeLabel} ein.
        </p>
      </div>

      <Card className="mt-6 md:mt-10 border-brand-neutral/40">
        <CardContent className="pt-5 md:pt-6 space-y-5">
          <p className="text-sm text-brand-night-navy/80 leading-relaxed">
            {role ? ROLE_DESC[role] : ""} Du brauchst nur einen kostenlosen
            KickPact-Account — keine Bestätigung durch den Admin, keine
            Wartezeit.
          </p>

          {isLoggedIn && role ? (
            <AcceptInviteButton
              token={token}
              clubSlug={clubSlug}
              teamId={invitation.teamId ?? null}
            />
          ) : (
            <Button variant="accent" size="lg" className="w-full" asChild>
              <Link href={`/login?team-invite=${token}`}>
                Login / Account anlegen →
              </Link>
            </Button>
          )}

          {invitation.recipientEmail ? (
            <p className="text-xs text-brand-night-navy/50">
              Diese Einladung ging ursprünglich an{" "}
              <strong>{invitation.recipientEmail}</strong>. Du musst dich nicht
              zwingend mit dieser Adresse einloggen — der Link funktioniert auch
              mit anderen Accounts.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <p className="mt-8 text-center text-xs text-brand-night-navy/50">
        Mit Klick auf den Login akzeptierst du Datenschutz + AGB.
      </p>
    </main>
  );
}
