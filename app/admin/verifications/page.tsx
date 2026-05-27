import {
  listPendingVerifications,
  listPendingTeamVerifications
} from "@/lib/db/queries/verifications";
import { VerificationsTable } from "./_components/verifications-table";
import { TeamVerificationsTable } from "./_components/team-verifications-table";

export const metadata = { title: "Verifications · Admin · KickPact" };

const CLUB_DOC_TYPE_LABEL: Record<string, string> = {
  vereinsregister_auszug: "Vereinsregister-Auszug",
  vorstands_beschluss: "Vorstandsbeschluss",
  vereinssatzung: "Vereinssatzung",
  mitgliederversammlung_protokoll: "MV-Protokoll",
  sonstiges: "Sonstiges"
};

const TEAM_DOC_TYPE_LABEL: Record<string, string> = {
  trainer_license: "Trainerlizenz",
  club_letter: "Vereinsbestätigung",
  team_photo: "Mannschaftsfoto",
  fussballde_entry: "Fußball.de-Eintrag",
  sonstiges: "Sonstiges"
};

export default async function VerificationsPage() {
  const [clubRows, teamRows] = await Promise.all([
    listPendingVerifications(),
    listPendingTeamVerifications()
  ]);

  const clubTableRows = clubRows.map((r) => ({
    id: r.id,
    clubName: r.clubName,
    clubSlug: r.clubSlug,
    submitterEmail: r.submitterEmail,
    submitterFullName: r.submitterFullName,
    submitterRole: r.submitterRole,
    submitterNotes: r.submitterNotes,
    docTypeLabel: CLUB_DOC_TYPE_LABEL[r.docType] ?? r.docType,
    docFilename: r.docFilename,
    docStorageKey: r.docStorageKey,
    submittedAt: r.submittedAt
  }));

  const teamTableRows = teamRows.map((r) => ({
    id: r.id,
    teamName: r.teamName,
    teamSaison: r.teamSaison,
    clubName: r.clubName,
    clubSlug: r.clubSlug,
    submitterEmail: r.submitterEmail,
    submitterFullName: r.submitterFullName,
    submitterRole: r.submitterRole,
    submitterNotes: r.submitterNotes,
    docTypeLabel: TEAM_DOC_TYPE_LABEL[r.docType] ?? r.docType,
    docFilename: r.docFilename,
    docStorageKey: r.docStorageKey,
    submittedAt: r.submittedAt
  }));

  return (
    <div className="space-y-10">
      <section>
        <h2 className="font-display font-black text-xl tracking-tight text-brand-night-navy mb-4">
          Vereine ({clubTableRows.length})
        </h2>
        {clubTableRows.length === 0 ? (
          <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-6 text-center text-sm text-brand-night-navy/60">
            Keine offenen Vereins-Verifizierungen.
          </div>
        ) : (
          <VerificationsTable rows={clubTableRows} />
        )}
      </section>

      <section>
        <h2 className="font-display font-black text-xl tracking-tight text-brand-night-navy mb-4">
          Mannschaften ({teamTableRows.length})
        </h2>
        {teamTableRows.length === 0 ? (
          <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-6 text-center text-sm text-brand-night-navy/60">
            Keine offenen Mannschafts-Verifizierungen.
          </div>
        ) : (
          <TeamVerificationsTable rows={teamTableRows} />
        )}
      </section>
    </div>
  );
}
