import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { assertTeamPageAccess } from "@/lib/auth/scope";
import { getActiveVerificationForTeam } from "@/lib/db/queries/verifications";
import { TeamVerificationForm } from "./_components/team-verification-form";

export const metadata = { title: "Mannschaft verifizieren · KickPact" };

/**
 * Asynchrone Mannschafts-Verifikation (Spec 2026-05-26 §1.7).
 *
 * Mannschaften ohne Vereinslizenz brauchen einen Nachweis (Trainerlizenz,
 * Vereinsbestätigung, Mannschaftsfoto, Spielleitungs-Eintrag oder Sonstiges).
 * Solange nicht verifiziert, werden Sponsoren-Rechnungen withheld erzeugt —
 * Pledges + Tracking laufen aber durch.
 *
 * Mannschaften unter Vereinslizenz erben die Club-Verifikation und brauchen
 * KEINE eigene team_verification.
 */
export default async function TeamVerifikationPage({
  params
}: {
  params: Promise<{ slug: string; teamId: string }>;
}) {
  const { slug, teamId } = await params;
  const { club } = await assertTeamPageAccess(slug, teamId, "admin");

  const [team] = await db
    .select({
      id: teams.id,
      name: teams.name,
      verifiedAt: teams.verifiedAt
    })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.clubId, club.id)))
    .limit(1);

  if (!team) {
    return (
      <div className="rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-4 text-sm text-brand-alert-red">
        Mannschaft nicht gefunden.
      </div>
    );
  }

  const existing = await getActiveVerificationForTeam(team.id);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
          Mannschafts-Verifikation
        </div>
        <h2 className="mt-1 font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy">
          {team.name}
        </h2>
        <p className="mt-2 text-sm text-brand-night-navy/60">
          Lade einen Nachweis hoch, dass du die Mannschaft betreust (Trainerlizenz,
          Vereinsbestätigung, Mannschaftsfoto oder ein Spielleitungs-Eintrag von
          Fußball.de). Unser Team prüft innerhalb von 1–2 Werktagen. Bis dahin werden
          Sponsoren-Rechnungen zurückgehalten — alles andere läuft normal weiter.
        </p>
      </div>

      {team.verifiedAt ? (
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 text-sm">
          <div className="font-semibold text-brand-night-navy">
            ✓ Verifiziert seit {team.verifiedAt.toLocaleDateString("de-DE")}
          </div>
          <p className="mt-1 text-brand-night-navy/70">
            Die Mannschaft ist verifiziert, Rechnungen werden normal versendet. Du
            kannst hier einen neuen Nachweis einreichen falls sich Rolle/Trainer
            geändert hat.
          </p>
        </div>
      ) : existing?.status === "pending" ? (
        <div className="rounded-lg border border-amber-300/50 bg-amber-50 p-4 text-sm">
          <div className="font-semibold text-brand-night-navy">
            ⏳ In Prüfung — eingereicht am{" "}
            {existing.submittedAt.toLocaleDateString("de-DE")}
          </div>
          <p className="mt-1 text-brand-night-navy/70">
            Wir prüfen den Nachweis. Du kannst hier einen weiteren Nachweis einreichen,
            falls etwas geändert hat oder du mehrere Belege liefern möchtest.
          </p>
        </div>
      ) : existing?.status === "rejected" ? (
        <div className="rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-4 text-sm">
          <div className="font-semibold text-brand-alert-red">
            ✗ Letzter Nachweis abgelehnt
          </div>
          <p className="mt-1 text-brand-night-navy/70">
            Grund: {existing.rejectionReason ?? "—"}. Bitte einen neuen Nachweis
            einreichen.
          </p>
        </div>
      ) : null}

      <TeamVerificationForm clubSlug={slug} teamId={team.id} />
    </div>
  );
}
