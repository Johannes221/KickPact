"use client";

import Link from "next/link";

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
  inviteToken: string | null;
  hasActivePledge: boolean;
}

export function InquiriesList({ inquiries }: { inquiries: Inquiry[] }) {
  return (
    <ul className="space-y-2 md:space-y-3">
      {inquiries.map((inq) => (
        <li
          key={inq.id}
          className="rounded-xl bg-white shadow-ios-card p-3 md:p-4"
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
          {inq.status === "accepted" && <AcceptedCta inquiry={inq} />}
        </li>
      ))}
    </ul>
  );
}

/**
 * CTA für eine angenommene Anfrage: führt den Sponsor zum eigentlichen
 * Sponsoring — entweder in den Pledge-Builder (Einladungs-Token) oder, wenn
 * bereits ein Pledge läuft, zur Pledge-Übersicht.
 */
function AcceptedCta({ inquiry }: { inquiry: Inquiry }) {
  if (inquiry.hasActivePledge) {
    return (
      <Link
        href="/sponsor/pledge"
        className="mt-3 inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-200 transition-colors"
      >
        ✓ Du sponserst — Übersicht
      </Link>
    );
  }
  if (inquiry.inviteToken) {
    return (
      <Link
        href={`/sponsor/pledge/new?invitation=${inquiry.inviteToken}`}
        className="mt-3 inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-brand-night-navy hover:bg-accent/90 transition-colors"
      >
        Jetzt sponsern →
      </Link>
    );
  }
  // Angenommen, aber Einladung abgelaufen/zurückgezogen.
  return (
    <p className="mt-3 text-xs text-brand-night-navy/50">
      Einladung abgelaufen — frag die Mannschaft nach einem neuen Link.
    </p>
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
