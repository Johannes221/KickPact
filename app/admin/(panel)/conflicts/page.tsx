import { listConflictClaimsForAdmin } from "@/lib/db/queries/membership-requests";
import { ConflictsTable } from "./_components/conflicts-table";

export const metadata = { title: "Konflikte · Admin · KickPact" };

export default async function ConflictsPage() {
  const enriched = await listConflictClaimsForAdmin();

  if (enriched.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-8 text-center text-sm text-brand-night-navy/60">
        Keine offenen Konflikte.
      </div>
    );
  }

  return <ConflictsTable rows={enriched} />;
}
