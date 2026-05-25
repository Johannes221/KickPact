import { listPendingVerifications } from "@/lib/db/queries/verifications";
import { VerificationsTable } from "./_components/verifications-table";

export const metadata = { title: "Verifications · Admin · KickPact" };

const DOC_TYPE_LABEL: Record<string, string> = {
  vereinsregister_auszug: "Vereinsregister-Auszug",
  vorstands_beschluss: "Vorstandsbeschluss",
  vereinssatzung: "Vereinssatzung",
  mitgliederversammlung_protokoll: "MV-Protokoll",
  sonstiges: "Sonstiges"
};

export default async function VerificationsPage() {
  const rows = await listPendingVerifications();

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-8 text-center text-sm text-brand-night-navy/60">
        Keine offenen Verifizierungen.
      </div>
    );
  }

  const tableRows = rows.map((r) => ({
    id: r.id,
    clubName: r.clubName,
    clubSlug: r.clubSlug,
    submitterEmail: r.submitterEmail,
    submitterFullName: r.submitterFullName,
    submitterRole: r.submitterRole,
    submitterNotes: r.submitterNotes,
    docTypeLabel: DOC_TYPE_LABEL[r.docType] ?? r.docType,
    docFilename: r.docFilename,
    docStorageKey: r.docStorageKey,
    submittedAt: r.submittedAt
  }));

  return <VerificationsTable rows={tableRows} />;
}
