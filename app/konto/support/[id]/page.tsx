import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getTicketForUser, ticketReference } from "@/lib/db/queries/support";
import { TicketThread } from "@/components/support/ticket-thread";
import { CustomerReplyForm } from "@/components/support/customer-reply-form";
import {
  StatusBadge,
  CategoryBadge,
  ContextBadge,
  STATUS_LABEL
} from "@/components/support/ticket-badges";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anfrage · KickPact" };

export default async function KontoSupportDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const ticket = await getTicketForUser(id, user.id);
  if (!ticket) notFound();

  const contextLabel =
    ticket.contextMeta && typeof ticket.contextMeta.label === "string"
      ? (ticket.contextMeta.label as string)
      : null;

  return (
    <main className="mx-auto max-w-2xl px-5 md:px-6 py-8 md:py-12 space-y-6">
      <div className="text-sm text-brand-night-navy/60">
        <Link href="/konto/support" className="hover:text-accent">
          ← Meine Anfragen
        </Link>
      </div>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={ticket.status} />
          <CategoryBadge category={ticket.category} />
          <ContextBadge contextType={ticket.contextType} />
        </div>
        <h1 className="font-display font-black text-xl md:text-3xl tracking-tight text-brand-night-navy">
          {ticket.subject}
        </h1>
        <p className="text-xs text-brand-night-navy/50">
          <span className="font-mono">{ticketReference(ticket.id)}</span>
          {contextLabel && <> · {contextLabel}</>}
          {ticket.contextType === "match" && ticket.contextUrl && (
            <>
              {" · "}
              <Link href={ticket.contextUrl} className="text-accent underline">
                Zum Spiel
              </Link>
            </>
          )}
        </p>
      </header>

      <TicketThread
        original={{ name: ticket.name, body: ticket.message, createdAt: ticket.createdAt }}
        messages={ticket.replies}
        showInternal={false}
      />

      {ticket.status === "closed" ? (
        <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-4 text-center text-sm text-brand-night-navy/60">
          Diese Anfrage ist {STATUS_LABEL.closed.toLowerCase()}. Schreib einfach eine neue Nachricht —
          dann öffnen wir sie wieder.
          <div className="mt-3">
            <CustomerReplyForm ticketId={ticket.id} />
          </div>
        </div>
      ) : (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-brand-night-navy">Antworten</h2>
          <CustomerReplyForm ticketId={ticket.id} />
        </section>
      )}
    </main>
  );
}
