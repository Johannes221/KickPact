"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MatchEventIcon } from "@/components/shared/match-event-icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { confirmApproval, disputeApproval } from "@/lib/actions/approvals";
import { toast } from "sonner";

function eur(cents: number) {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function eventLabel(type: string, subtype: string | null): string {
  if (type === "tor") return "Tor";
  if (type === "karte") return subtype === "rot" ? "Rote Karte" : "Gelbe Karte";
  if (type === "spezial") {
    if (subtype === "kopfball") return "Kopfballtor";
    if (subtype === "hackentor") return "Hackentor";
    if (subtype === "volley") return "Volley";
    if (subtype === "elfmeter") return "Elfmeter-Tor";
    if (subtype === "freistoss") return "Freistoß-Tor";
    if (subtype === "assist") return "Vorlage";
    if (subtype === "man_of_match") return "Spieler des Spiels";
    return subtype ?? "Spezial-Event";
  }
  return type;
}

export interface ApprovalRowData {
  approvalId: string;
  matchId: string;
  matchDatum: Date;
  heimName: string;
  gastName: string;
  ergebnisHeim: number | null;
  ergebnisGast: number | null;
  teamName: string;
  clubName: string;
  minute: number | null;
  eventType: string;
  eventSubtype: string | null;
  playerName: string | null;
  amountCents: number;
  triggerType: string;
}

export function ApprovalRow({ data }: { data: ApprovalRowData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [reason, setReason] = useState("");

  function handleConfirm() {
    startTransition(async () => {
      try {
        await confirmApproval(data.approvalId);
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
        await disputeApproval({ approvalId: data.approvalId, reason: reason || undefined });
        toast.success("Bestritten — keine Charge");
        setDisputeOpen(false);
        setReason("");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  const datumStr = new Date(data.matchDatum).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });

  return (
    <div className="rounded-lg border border-brand-neutral/40 bg-white p-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <div className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
          {data.clubName} · {data.teamName}
        </div>
        <div className="text-xs text-brand-night-navy/50 tabular-nums">{datumStr}</div>
      </div>

      <div className="flex items-center gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-off-white">
          <MatchEventIcon type={data.eventType} subtype={data.eventSubtype} className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-display font-black text-lg tracking-tight text-brand-night-navy">
            {eventLabel(data.eventType, data.eventSubtype)}
            {data.minute !== null && (
              <span className="text-brand-night-navy/40 ml-2 font-mono text-sm">
                {data.minute}&apos;
              </span>
            )}
          </div>
          {data.playerName && (
            <div className="text-sm text-brand-night-navy/70 mt-0.5">{data.playerName}</div>
          )}
          <div className="text-xs text-brand-night-navy/50 mt-1">
            {data.heimName} {data.ergebnisHeim ?? "—"}:{data.ergebnisGast ?? "—"} {data.gastName}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display font-black text-2xl tracking-tight text-accent tabular-nums">
            {eur(data.amountCents)}
          </div>
          <div className="text-xs text-brand-night-navy/50 mt-0.5">via {data.triggerType}</div>
        </div>
      </div>

      <div className="mt-5 flex gap-2 justify-end">
        <Button
          variant="ghost"
          onClick={() => setDisputeOpen(true)}
          disabled={pending}
          className="text-brand-alert-red hover:bg-brand-alert-red/5 hover:text-brand-alert-red"
        >
          Bestreiten
        </Button>
        <Button variant="accent" onClick={handleConfirm} disabled={pending}>
          {pending ? "…" : "✓ Bestätigen"}
        </Button>
      </div>

      <Dialog open={disputeOpen} onOpenChange={setDisputeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display font-black tracking-tight">
              Event bestreiten?
            </DialogTitle>
            <DialogDescription>
              Du sagst, der Verein hat das Event falsch gemeldet. Die Charge wird storniert.
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
              {pending ? "…" : "Bestreiten"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
