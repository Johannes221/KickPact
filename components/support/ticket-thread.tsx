import { cn } from "@/lib/utils";
import type { SupportReplyAuthor } from "@/lib/db/queries/support";

export interface ThreadMessage {
  id: string;
  body: string;
  authorType: SupportReplyAuthor;
  internal?: boolean;
  createdAt: Date;
}

function fmt(d: Date): string {
  return new Date(d).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function authorLabel(authorType: SupportReplyAuthor, internal: boolean | undefined): string {
  if (internal) return "Interne Notiz";
  if (authorType === "operator") return "KickPact Support";
  if (authorType === "customer") return "Du";
  return "System";
}

/**
 * Chronologischer Verlauf eines Tickets. `showInternal` steuert, ob interne
 * Notizen sichtbar sind (true im Admin-Panel, false im Kunden-Center — dort
 * werden interne Notizen bereits in der Query herausgefiltert).
 */
export function TicketThread({
  original,
  messages,
  showInternal = false
}: {
  original: { name: string; body: string; createdAt: Date };
  messages: ThreadMessage[];
  showInternal?: boolean;
}) {
  const visible = showInternal ? messages : messages.filter((m) => !m.internal);

  return (
    <div className="space-y-3">
      {/* Ursprüngliche Meldung */}
      <div className="rounded-2xl bg-white shadow-ios-card p-4">
        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-brand-night-navy">{original.name}</span>
          <span className="text-brand-night-navy/50">{fmt(original.createdAt)}</span>
        </div>
        <p className="whitespace-pre-wrap text-sm text-brand-night-navy/90">{original.body}</p>
      </div>

      {visible.map((m) => {
        const isOperator = m.authorType === "operator" && !m.internal;
        const isCustomer = m.authorType === "customer";
        return (
          <div
            key={m.id}
            className={cn(
              "rounded-2xl border p-4",
              m.internal
                ? "border-amber-300/60 bg-amber-50"
                : isOperator
                  ? "border-accent/30 bg-accent/5"
                  : isCustomer
                    ? "border-brand-neutral/40 bg-white"
                    : "border-brand-neutral/30 bg-brand-off-white"
            )}
          >
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span
                className={cn(
                  "font-semibold",
                  m.internal ? "text-amber-700" : "text-brand-night-navy"
                )}
              >
                {authorLabel(m.authorType, m.internal)}
              </span>
              <span className="text-brand-night-navy/50">{fmt(m.createdAt)}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-brand-night-navy/90">{m.body}</p>
          </div>
        );
      })}
    </div>
  );
}
