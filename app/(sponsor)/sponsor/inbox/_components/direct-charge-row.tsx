"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { confirmSeasonCharge, disputeSeasonCharge } from "@/lib/actions/season-charges";
import { triggerLabel } from "@/lib/triggers/labels";
import { formatSaisonLabel } from "@/lib/utils/saison";
import { abbreviateTeamName } from "@/lib/utils/team-name";
import type { PendingDirectChargeRow } from "@/lib/db/queries/approvals";
import { toast } from "sonner";

function eur(cents: number) {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

/**
 * Bestätigungs-Karte für Charges OHNE Spiel-Event (Audit 2026-06-11 / C2+C3):
 * Saison-Ziele (season_custom) + Outcome-Beiträge mit manuell gemeldeter
 * Tor-Evidenz (Hattrick/Comeback). Bestätigung läuft direkt auf der Charge.
 */
export function DirectChargeRow({ data }: { data: PendingDirectChargeRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState("");

  function handleConfirm() {
    startTransition(async () => {
      try {
        await confirmSeasonCharge(data.chargeId);
        toast.success(`${eur(data.amountCents)} bestätigt`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function handleDispute() {
    startTransition(async () => {
      try {
        await disputeSeasonCharge({ chargeId: data.chargeId, reason: reason || undefined });
        toast.success("Abgelehnt — kein Beitrag");
        setDisputeOpen(false);
        setReason("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  const isSeason = data.saison !== null;
  const contextLabel = isSeason
    ? formatSaisonLabel(data.saison)
    : data.heimName && data.gastName
      ? `${abbreviateTeamName(data.heimName)} ${data.ergebnisHeim ?? "—"}:${data.ergebnisGast ?? "—"} ${abbreviateTeamName(data.gastName)}`
      : "Spiel";

  return (
    <div className="rounded-lg bg-white shadow-ios-card p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
          {data.clubName} · {data.teamName}
        </div>
        <div className="text-xs text-brand-night-navy/50 tabular-nums">
          {new Date(data.createdAt).toLocaleDateString("de-DE", {
            day: "2-digit",
            month: "long",
            year: "numeric"
          })}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="font-display font-bold text-lg tracking-tight text-brand-night-navy">
            {triggerLabel(data.triggerType)}
          </div>
          <div className="text-xs text-brand-night-navy/50 mt-1 truncate">{contextLabel}</div>
        </div>
        <div className="text-right">
          <div className="font-display font-bold text-2xl tracking-tight text-accent tabular-nums">
            {eur(data.amountCents)}
          </div>
        </div>
      </div>

      <div className="mt-5 flex gap-2 justify-end">
        <Button
          variant="ghost"
          onClick={() => setDisputeOpen(true)}
          disabled={pending}
          className="text-brand-alert-red hover:bg-brand-alert-red/5 hover:text-brand-alert-red"
        >
          Ablehnen
        </Button>
        <Button variant="accent" onClick={handleConfirm} disabled={pending}>
          {pending ? "…" : "✓ Bestätigen"}
        </Button>
      </div>

      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display font-bold tracking-tight">
              Beitrag ablehnen?
            </DialogTitle>
            <DialogDescription>
              Du sagst, das gemeldete Ziel/Ereignis stimmt nicht. Der Beitrag wird storniert.
              Optional ein Grund (sieht der Verein).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Grund (optional)"
            rows={3}
            maxLength={500}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDisputeOpen(false)} disabled={pending}>
              Abbrechen
            </Button>
            <Button
              onClick={handleDispute}
              disabled={pending}
              className="bg-brand-alert-red text-white hover:bg-brand-alert-red/90"
            >
              {pending ? "…" : "Ablehnen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
