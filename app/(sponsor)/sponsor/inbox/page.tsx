import { requireUser } from "@/lib/auth/session";
import { listPendingForSponsor } from "@/lib/db/queries/approvals";
import { ApprovalRow } from "./_components/approval-row";

export const metadata = { title: "Inbox · KickPact" };

export default async function SponsorInboxPage() {
  const user = await requireUser();
  const pending = await listPendingForSponsor(user.id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-10">
        <h1 className="font-display font-black text-4xl md:text-5xl tracking-tight text-brand-night-navy">
          Inbox
        </h1>
        <p className="mt-2 text-brand-night-navy/60">
          {pending.length === 0
            ? "Keine ausstehenden Events."
            : `${pending.length} ${pending.length === 1 ? "Event" : "Events"} zur Bestätigung.`}
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-8 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <p className="text-brand-night-navy/70">
            Alles erledigt! Vereine melden ein Spezial-Event und du kriegst hier eine Anfrage.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pending.map((p) => (
            <ApprovalRow key={p.approvalId} data={p} />
          ))}
        </div>
      )}
    </main>
  );
}
