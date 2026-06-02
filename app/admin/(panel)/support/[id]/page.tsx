import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupportTicket, ticketReference } from "@/lib/db/queries/support";
import { listPlatformAdmins } from "@/lib/auth/admin";
import { SupportReplyForm } from "@/components/admin/support-reply-form";
import { SupportStatusControl } from "@/components/admin/support-status-control";
import { SupportPriorityControl } from "@/components/admin/support-priority-control";
import { SupportAssignControl } from "@/components/admin/support-assign-control";
import { TicketThread } from "@/components/support/ticket-thread";
import { CategoryBadge, ContextBadge } from "@/components/support/ticket-badges";

export const metadata = { title: "Ticket · Support · Admin" };
export const dynamic = "force-dynamic";

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
  const [ticket, admins] = await Promise.all([getSupportTicket(id), listPlatformAdmins()]);
  if (!ticket) notFound();

  const assignOptions = admins.map((a) => ({ id: a.id, label: a.name ? `${a.name} (${a.email})` : a.email }));
  const contextLabel =
    ticket.contextMeta && typeof ticket.contextMeta.label === "string"
      ? (ticket.contextMeta.label as string)
      : null;

  return (
    <div className="space-y-6 max-w-3xl">
      <Link
        href="/admin/support"
        className="text-sm font-semibold text-brand-night-navy/60 hover:text-brand-night-navy"
      >
        ← Zurück zur Inbox
      </Link>

      <div className="rounded-2xl border border-brand-neutral/40 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display font-black text-xl text-brand-night-navy">{ticket.subject}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-brand-night-navy/60">
              <span className="font-mono text-xs">{ticketReference(ticket.id)}</span>
              <span>·</span>
              <CategoryBadge category={ticket.category} />
              <ContextBadge contextType={ticket.contextType} />
              <span>·</span>
              {fmt(ticket.createdAt)}
            </p>
            <p className="mt-1 text-sm text-brand-night-navy/60">
              {ticket.name} · {ticket.email}
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

        {/* Kontext-Block (z.B. verlinktes Spiel) */}
        {ticket.contextType !== "none" && (contextLabel || ticket.contextUrl) && (
          <div className="rounded-xl border border-brand-neutral/30 bg-brand-off-white p-3 text-sm">
            <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50 mb-1">
              Kontext
            </p>
            {contextLabel && <p className="text-brand-night-navy">{contextLabel}</p>}
            {ticket.contextUrl && (
              <Link href={ticket.contextUrl} className="text-sm font-semibold text-accent hover:underline">
                {ticket.contextType === "match" ? "Zum Spiel" : "Zur Seite"} →
              </Link>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50 mb-1">
              Status
            </p>
            <SupportStatusControl ticketId={ticket.id} current={ticket.status} />
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50 mb-1">
              Priorität
            </p>
            <SupportPriorityControl ticketId={ticket.id} current={ticket.priority} />
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50 mb-1">
            Zugewiesen an
          </p>
          <SupportAssignControl
            ticketId={ticket.id}
            current={ticket.assignedToUserId}
            options={assignOptions}
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">Verlauf</p>
        <TicketThread
          original={{ name: ticket.name, body: ticket.message, createdAt: ticket.createdAt }}
          messages={ticket.replies}
          showInternal
        />
      </div>

      <div className="rounded-2xl border border-brand-neutral/40 bg-white p-5">
        <p className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50 mb-3">
          Antworten / Notiz
        </p>
        <SupportReplyForm ticketId={ticket.id} />
      </div>
    </div>
  );
}
