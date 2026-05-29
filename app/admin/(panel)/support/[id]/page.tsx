import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupportTicket } from "@/lib/db/queries/support";
import { SupportReplyForm } from "@/components/admin/support-reply-form";
import { SupportStatusControl } from "@/components/admin/support-status-control";

export const metadata = { title: "Ticket · Support · Admin" };
export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  frage: "Frage",
  bug: "Bug",
  abrechnung: "Abrechnung",
  sonstiges: "Sonstiges"
};

function fmt(d: Date): string {
  return new Date(d).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default async function SupportTicketPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ticket = await getSupportTicket(id);
  if (!ticket) notFound();

  return (
    <div className="space-y-6 max-w-3xl">
      <Link href="/admin/support" className="text-sm font-semibold text-brand-night-navy/60 hover:text-brand-night-navy">
        ← Zurück zur Inbox
      </Link>

      <div className="rounded-2xl border border-brand-neutral/40 bg-white p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display font-black text-xl text-brand-night-navy">{ticket.subject}</h2>
            <p className="mt-1 text-sm text-brand-night-navy/60">
              {ticket.name} · {ticket.email} · {CATEGORY_LABELS[ticket.category] ?? ticket.category} ·{" "}
              {fmt(ticket.createdAt)}
            </p>
            {ticket.userId && (
              <Link
                href={`/admin/users/${ticket.userId}`}
                className="mt-1 inline-block text-sm font-semibold text-accent hover:underline"
              >
                Verknüpfter Account ansehen →
              </Link>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50 mb-1">
            Status
          </p>
          <SupportStatusControl ticketId={ticket.id} current={ticket.status} />
        </div>

        <div className="rounded-xl bg-brand-off-white p-4">
          <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50 mb-2">
            Nachricht
          </p>
          <p className="whitespace-pre-wrap text-brand-night-navy">{ticket.message}</p>
        </div>
      </div>

      {ticket.replies.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
            Verlauf
          </p>
          {ticket.replies.map((r) => (
            <div key={r.id} className="rounded-xl border border-brand-neutral/30 bg-white p-4">
              <p className="text-xs text-brand-night-navy/50 mb-1">
                Antwort · {fmt(r.createdAt)}
                {r.mailId ? <span className="text-brand-night-navy/40"> · Mail {r.mailId}</span> : null}
              </p>
              <p className="whitespace-pre-wrap text-brand-night-navy">{r.body}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-brand-neutral/40 bg-white p-5">
        <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50 mb-3">
          Antworten
        </p>
        <SupportReplyForm ticketId={ticket.id} />
      </div>
    </div>
  );
}
