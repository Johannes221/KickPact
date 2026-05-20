import { requireUser } from "@/lib/auth/session";
import { listPendingForSponsor } from "@/lib/db/queries/approvals";
import { ApprovalRow } from "./_components/approval-row";

export const metadata = { title: "Inbox · KickPact" };

export default async function SponsorInboxPage() {
  const user = await requireUser();
  const pending = await listPendingForSponsor(user.id);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 md:mb-10">
        <h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
          Inbox
        </h1>
        <p className="mt-1.5 md:mt-2 text-sm md:text-base text-brand-night-navy/60">
          {pending.length === 0
            ? "Keine ausstehenden Events."
            : `${pending.length} ${pending.length === 1 ? "Event" : "Events"} zur Bestätigung.`}
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-6 md:p-8 text-center">
          <div className="text-3xl md:text-4xl mb-2 md:mb-3">🎉</div>
          <p className="text-sm md:text-base text-brand-night-navy/70">
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
    </div>
  );
}
