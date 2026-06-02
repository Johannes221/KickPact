import Link from "next/link";
import { redirect } from "next/navigation";
import { assertClubAccess } from "@/lib/auth/scope";
import { getClubById, getClubTeamsBasic } from "@/lib/db/queries/club-admin";
import { listTeamLicensePlansForClub } from "@/lib/db/queries/subscriptions";
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
  const clubRow = await getClubById(club.id);

  const teamRows = await getClubTeamsBasic(club.id);
  const existingFussballdeIds = new Set(
    teamRows
      .map((t) => t.fussballdeTeamId)
      .filter((v): v is string => v !== null)
  );

  const hasVereinPlan = (await listTeamLicensePlansForClub(club.id)).some(
    (l) => l.plan === "verein"
  );

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
          Für diesen Verein ist keine Spieldaten-Verknüpfung hinterlegt.
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
