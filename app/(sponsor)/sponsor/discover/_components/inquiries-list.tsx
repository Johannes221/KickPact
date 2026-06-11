"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { createSponsorInquiry } from "@/lib/actions/sponsor-inquiries";

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
  // Angenommen, aber Einladung abgelaufen/zurückgezogen → erneut anfragen
  // statt Sackgasse (A5).
  return <ReInquireButton teamId={inquiry.teamId} />;
}

/**
 * A5: Löst den bestehenden Inquiry-Flow erneut aus, wenn die angenommene
 * Einladung abgelaufen ist. Fehler (z.B. Rate-Limit) kommen als
 * {ok:false,message} aus der Action und landen im Toast (A8).
 */
function ReInquireButton({ teamId }: { teamId: string }) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <p className="mt-3 inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-700">
        ✓ Anfrage gesendet — die Mannschaft meldet sich per Mail.
      </p>
    );
  }

  function handleClick() {
    startTransition(async () => {
      const res = await createSponsorInquiry({ teamId });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setSent(true);
      toast.success("Anfrage versendet!");
    });
  }

  return (
    <div className="mt-3">
      <p className="text-xs text-brand-night-navy/50">
        Die Einladung ist abgelaufen — frag die Mannschaft einfach erneut an.
      </p>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="mt-2 inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-brand-night-navy hover:bg-accent/90 transition-colors disabled:opacity-60"
      >
        {pending ? "Sende…" : "Erneut anfragen"}
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: BadgeProps["tone"] }> = {
    pending: { label: "Wartet", tone: "warning" },
    accepted: { label: "Angenommen", tone: "success" },
    rejected: { label: "Abgelehnt", tone: "danger" },
    expired: { label: "Abgelaufen", tone: "neutral" }
  };
  const entry = map[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}
