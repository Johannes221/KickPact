import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { Hourglass, CheckCircle2 } from "lucide-react";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import {
  clubs,
  teams,
  clubMembershipRequests,
  clubMemberships,
  teamMemberships
} from "@/lib/db/schema";
import { RequestForm } from "./_components/request-form";

export const metadata = { title: "Zugriff anfragen · KickPact" };

export default async function ZugriffAnfragenPage({
  searchParams
}: {
  searchParams: Promise<{ clubSlug?: string; teamId?: string }>;
}) {
  const { clubSlug, teamId } = await searchParams;
  if (!clubSlug) redirect("/onboarding");

  const user = await requireUser();

  const [club] = await db
    .select({ id: clubs.id, name: clubs.name, slug: clubs.slug })
    .from(clubs)
    .where(eq(clubs.slug, clubSlug))
    .limit(1);
  if (!club) redirect("/onboarding");

  const teamRows = await db
    .select({ id: teams.id, name: teams.name, saison: teams.saison })
    .from(teams)
    .where(eq(teams.clubId, club.id));

  // Mannschafts-Modus: Anfrage zielt auf GENAU diese Mannschaft (kommt aus dem
  // Onboarding-Flow via ?teamId). Sonst Fallback auf Vereins-Anfrage.
  const fixedTeam = teamId
    ? (
        await db
          .select({ id: teams.id, name: teams.name, saison: teams.saison })
          .from(teams)
          .where(and(eq(teams.id, teamId), eq(teams.clubId, club.id)))
          .limit(1)
      )[0] ?? null
    : null;

  // ── De-Dupe: schon angefragt oder schon Mitglied? ──────────────────────────
  const [pendingReq] = await db
    .select({ id: clubMembershipRequests.id })
    .from(clubMembershipRequests)
    .where(
      and(
        eq(clubMembershipRequests.userId, user.id),
        eq(clubMembershipRequests.clubId, club.id),
        eq(clubMembershipRequests.status, "pending"),
        fixedTeam
          ? eq(clubMembershipRequests.requestedTeamId, fixedTeam.id)
          : isNull(clubMembershipRequests.requestedTeamId)
      )
    )
    .limit(1);

  let alreadyMember = false;
  if (fixedTeam) {
    const [tm] = await db
      .select({ userId: teamMemberships.userId })
      .from(teamMemberships)
      .where(
        and(
          eq(teamMemberships.userId, user.id),
          eq(teamMemberships.teamId, fixedTeam.id)
        )
      )
      .limit(1);
    alreadyMember = !!tm;
  } else {
    const [cm] = await db
      .select({ userId: clubMemberships.userId })
      .from(clubMemberships)
      .where(
        and(
          eq(clubMemberships.userId, user.id),
          eq(clubMemberships.clubId, club.id)
        )
      )
      .limit(1);
    alreadyMember = !!cm;
  }

  const targetLabel = fixedTeam ? fixedTeam.name : club.name;

  return (
    <main className="mx-auto max-w-2xl px-5 md:px-6 py-10 md:py-16">
      <div className="mb-8">
        <div className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
          Zugriff anfragen
        </div>
        <h1 className="mt-1 font-display font-black text-2xl md:text-4xl tracking-tight text-brand-night-navy">
          {fixedTeam ? `${fixedTeam.name}` : club.name}
        </h1>
        <p className="mt-2 text-sm text-brand-night-navy/60">
          {fixedTeam
            ? "Diese Mannschaft wird schon bei KickPact betreut. Stell eine Anfrage — die Admins entscheiden, ob du Zugriff bekommst."
            : "Dieser Verein ist schon bei KickPact. Stell eine Anfrage — die Admins entscheiden, ob du Zugriff bekommst."}
        </p>
      </div>

      {alreadyMember ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" aria-hidden />
            <div>
              <h2 className="font-display font-black text-lg tracking-tight text-brand-night-navy">
                Du bist bereits dabei
              </h2>
              <p className="mt-1 text-sm text-brand-night-navy/70">
                Du hast schon Zugriff auf {targetLabel}. Kein erneuter Antrag
                nötig.
              </p>
              <Link
                href="/select-role"
                className="mt-3 inline-flex items-center text-sm font-semibold text-accent hover:underline"
              >
                Zu meinen Rollen →
              </Link>
            </div>
          </div>
        </div>
      ) : pendingReq ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
          <div className="flex items-start gap-3">
            <Hourglass className="mt-0.5 h-6 w-6 shrink-0 text-amber-500" aria-hidden />
            <div>
              <h2 className="font-display font-black text-lg tracking-tight text-brand-night-navy">
                Zugriff bereits angefragt
              </h2>
              <p className="mt-1 text-sm text-brand-night-navy/70">
                Deine Anfrage für {targetLabel} liegt schon bei den Admins. Du
                musst nichts weiter tun — sobald sie freigegeben ist, taucht die
                Mannschaft in deinem Rollen-Menü auf.
              </p>
              <Link
                href="/select-role"
                className="mt-3 inline-flex items-center text-sm font-semibold text-accent hover:underline"
              >
                Zu meinen Rollen →
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <RequestForm
          clubSlug={club.slug}
          clubName={club.name}
          teams={teamRows}
          fixedTeam={fixedTeam}
        />
      )}
    </main>
  );
}
