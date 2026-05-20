"use client";

interface Inquiry {
  id: string;
  teamId: string;
  teamName: string;
  clubName: string;
  status: string;
  message: string | null;
  responseMessage: string | null;
  createdAt: Date;
  respondedAt: Date | null;
}

export function InquiriesList({ inquiries }: { inquiries: Inquiry[] }) {
  return (
    <ul className="space-y-2 md:space-y-3">
      {inquiries.map((inq) => (
        <li
          key={inq.id}
          className="rounded-xl border border-brand-neutral/40 bg-white p-3 md:p-4"
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <div className="font-semibold text-sm md:text-base text-brand-night-navy">
                {inq.teamName}
              </div>
              <div className="text-xs text-brand-night-navy/50">{inq.clubName}</div>
            </div>
            <StatusBadge status={inq.status} />
          </div>
          {inq.message && (
            <p className="mt-2 text-xs text-brand-night-navy/60 italic">
              Deine Nachricht: „{inq.message}"
            </p>
          )}
          {inq.responseMessage && (
            <p className="mt-2 text-xs text-brand-night-navy/80 rounded bg-brand-off-white p-2">
              <strong>Antwort:</strong> {inq.responseMessage}
            </p>
          )}
          <div className="mt-2 text-[0.65rem] text-brand-night-navy/40">
            Gesendet {new Date(inq.createdAt).toLocaleDateString("de-DE")}
            {inq.respondedAt && (
              <span> · Antwort {new Date(inq.respondedAt).toLocaleDateString("de-DE")}</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Wartet", cls: "bg-accent/10 text-accent-dark" },
    accepted: { label: "Angenommen", cls: "bg-emerald-100 text-emerald-800" },
    rejected: { label: "Abgelehnt", cls: "bg-rose-100 text-rose-700" },
    expired: { label: "Abgelaufen", cls: "bg-neutral-100 text-neutral-700" }
  };
  const entry = map[status] ?? { label: status, cls: "bg-neutral-100 text-neutral-700" };
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold " +
        entry.cls
      }
    >
      {entry.label}
    </span>
  );
}
