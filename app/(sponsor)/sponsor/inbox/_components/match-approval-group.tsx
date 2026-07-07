"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ApprovalRow, type ApprovalRowData } from "./approval-row";
import { confirmApprovals } from "@/lib/actions/approvals";
import { abbreviateTeamName } from "@/lib/utils/team-name";
import { toast } from "sonner";

function eur(cents: number) {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

/**
 * Batch-Karte für alle ausstehenden Bestätigungen EINES Spiels (Tier-3-Fix):
 * Manual-Teams erzeugen pro Tor/Outcome eine eigene Approval-Zeile — ein
 * 8:0-Spiel bündelt hier zu einer Karte mit „Alle bestätigen (dieses Spiel)".
 * Einzelne Events bleiben zum gezielten Bestreiten aufklappbar. Bestätigen ist
 * der positive Happy Path (kein Confirm-Dialog nötig); Bestreiten läuft weiter
 * pro Event über den ApprovalRow-Dialog.
 */
export function MatchApprovalGroup({ rows }: { rows: ApprovalRowData[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  const head = rows[0];
  const total = rows.reduce((sum, r) => sum + r.amountCents, 0);
  const count = rows.length;

  const datumStr = new Date(head.matchDatum).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  function handleConfirmAll() {
    startTransition(async () => {
      const res = await confirmApprovals(rows.map((r) => r.approvalId));
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      if (res.confirmed === 0) {
        toast.error("Nichts zu bestätigen — evtl. schon erledigt oder widerrufen.");
      } else {
        toast.success(
          `${res.confirmed} ${res.confirmed === 1 ? "Beitrag" : "Beiträge"} bestätigt`
        );
      }
      router.refresh();
    });
  }

  return (
    <div className="rounded-lg bg-white shadow-ios-card p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
          {head.clubName} · {head.teamName}
        </div>
        <div className="text-xs text-brand-night-navy/50 tabular-nums">{datumStr}</div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="font-display font-bold text-lg tracking-tight text-brand-night-navy">
            {abbreviateTeamName(head.heimName)}{" "}
            <span className="font-mono tabular-nums">
              {head.ergebnisHeim ?? "—"}:{head.ergebnisGast ?? "—"}
            </span>{" "}
            {abbreviateTeamName(head.gastName)}
          </div>
          <div className="text-sm text-brand-night-navy/60 mt-0.5">
            {count} {count === 1 ? "Ereignis" : "Ereignisse"} zur Bestätigung
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display font-bold text-2xl tracking-tight text-accent tabular-nums">
            {eur(total)}
          </div>
          <div className="text-xs text-brand-night-navy/50 mt-0.5">gesamt</div>
        </div>
      </div>

      <div className="mt-5 flex gap-2 justify-end">
        <Button
          variant="ghost"
          onClick={() => setExpanded((v) => !v)}
          disabled={pending}
          aria-expanded={expanded}
        >
          {expanded ? "Zuklappen" : "Einzeln prüfen"}
        </Button>
        <Button variant="accent" onClick={handleConfirmAll} disabled={pending}>
          {pending ? "…" : `✓ Alle bestätigen · ${count}`}
        </Button>
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-brand-neutral/40 pt-4">
          {rows.map((r) => (
            <ApprovalRow key={r.approvalId} data={r} />
          ))}
        </div>
      )}
    </div>
  );
}
