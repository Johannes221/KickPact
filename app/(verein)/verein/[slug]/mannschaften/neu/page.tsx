import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { teamLicenses } from "@/lib/db/schema/billing";
import { assertClubAccess } from "@/lib/auth/scope";
import { NeuesTeamWizard } from "./_components/neues-team-wizard";

export const metadata = { title: "Mannschaft hinzufügen · KickPact" };

/**
 * Team-Creation-Wizard für Clubs, die schon onboarded sind.
 *
 * Zwei Steps:
 *   1. Fußball.de-Mannschaft auswählen (gefiltert auf den
 *      `fussballdeVereinId` des Clubs)
 *   2. Saison + Plan-Toggle (Plan-Toggle nur sichtbar wenn der Verein
 *      KEINE Vereinslizenz hat — bei Vereinslizenz wird automatisch
 *      gebündelt)
 *
 * Permission: nur Admins (Lizenz-Cost-Implikation).
 */
export default async function NeuesTeamPage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { club } = await assertClubAccess(slug, "admin");

  if (!club) redirect(`/verein/${slug}`);

  // Vereinslizenz-Detection für Plan-Toggle-Sichtbarkeit
  const [clubRow] = await db
    .select({
      id: clubs.id,
      name: clubs.name,
      fussballdeVereinId: clubs.fussballdeVereinId
    })
    .from(clubs)
    .where(eq(clubs.id, club.id))
    .limit(1);

  const teamRows = await db
    .select({ id: teams.id, fussballdeTeamId: teams.fussballdeTeamId })
    .from(teams)
    .where(eq(teams.clubId, club.id));
  const teamIds = teamRows.map((t) => t.id);
  const existingFussballdeIds = new Set(
    teamRows
      .map((t) => t.fussballdeTeamId)
      .filter((v): v is string => v !== null)
  );

  let hasVereinPlan = false;
  if (teamIds.length > 0) {
    const lics = await db
      .select({ plan: teamLicenses.plan })
      .from(teamLicenses)
      .where(inArray(teamLicenses.teamId, teamIds));
    hasVereinPlan = lics.some((l) => l.plan === "verein");
  }

  return (
    <div className="mx-auto max-w-2xl px-4 md:px-6 py-6 md:py-10 space-y-6">
      <div>
        <Link
          href={`/verein/${slug}/mannschaften`}
          className="text-sm text-brand-night-navy/60 hover:text-accent"
        >
          ← Mannschaften
        </Link>
        <h1 className="mt-1.5 font-display font-black text-3xl md:text-4xl tracking-tight text-brand-night-navy">
          Mannschaft hinzufügen
        </h1>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          Du fügst eine weitere Mannschaft zu <strong>{clubRow.name}</strong> hinzu.
        </p>
      </div>

      {!clubRow.fussballdeVereinId ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Für diesen Verein ist keine Fußball.de-Verknüpfung hinterlegt.
          Bitte ergänze sie zuerst in den Vereins-Einstellungen.
        </div>
      ) : (
        <NeuesTeamWizard
          clubSlug={slug}
          clubName={clubRow.name}
          fussballdeVereinId={clubRow.fussballdeVereinId}
          hasVereinPlan={hasVereinPlan}
          existingFussballdeTeamIds={Array.from(existingFussballdeIds)}
        />
      )}
    </div>
  );
}
