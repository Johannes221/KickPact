"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { invoiceDownloadUrl, markInvoicePaidBySponsor } from "@/lib/actions/invoices";

interface Row {
  id: string;
  period: string;
  totalCents: number;
  status: string;
  pdfUrl: string | null;
  clubName: string;
  clubSlug: string;
  sentAt: Date | null;
  paidMarkedAt: Date | null;
  markedPaidBySponsorAt: Date | null;
  createdAt: Date;
}

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

type PayState =
  | { kind: "open" }
  | { kind: "sponsor_marked"; at: Date }
  | { kind: "club_confirmed"; at: Date };

function payState(row: Row): PayState {
  if (row.paidMarkedAt) return { kind: "club_confirmed", at: row.paidMarkedAt };
  if (row.markedPaidBySponsorAt)
    return { kind: "sponsor_marked", at: row.markedPaidBySponsorAt };
  return { kind: "open" };
}

export function SponsorInvoicesList({ invoices }: { invoices: Row[] }) {
  async function handleDownload(id: string) {
    try {
      const url = await invoiceDownloadUrl(id);
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download fehlgeschlagen");
    }
  }

  return (
    <ul className="space-y-3">
      {invoices.map((inv) => (
        <InvoiceRow key={inv.id} inv={inv} onDownload={() => handleDownload(inv.id)} />
      ))}
    </ul>
  );
}

function InvoiceRow({ inv, onDownload }: { inv: Row; onDownload: () => void }) {
  const [pending, startTransition] = useTransition();
  const state = payState(inv);

  function handleToggle() {
    startTransition(async () => {
      try {
        const res = await markInvoicePaidBySponsor(inv.id);
        toast.success(
          res.markedPaidBySponsorAt
            ? "Markiert als bezahlt — der Verein bestätigt den Eingang."
            : "Markierung zurückgenommen."
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Konnte Status nicht ändern");
      }
    });
  }

  return (
    <li className="rounded-2xl border border-brand-neutral/40 bg-white p-4 md:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-mono tabular-nums text-xs uppercase tracking-wider text-brand-night-navy/50">
            {inv.period}
          </div>
          <div className="mt-1 font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
            {inv.clubName}
          </div>
          <div className="mt-1 text-xs text-brand-night-navy/50">
            {inv.sentAt
              ? `Versendet am ${new Date(inv.sentAt).toLocaleDateString("de-DE")}`
              : "Noch nicht versendet"}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display font-black text-xl md:text-2xl tracking-tight text-accent-dark tabular-nums">
            {eur(inv.totalCents)}
          </div>
          <PayPill state={state} />
        </div>
      </div>
      <div className="mt-3 md:mt-4 flex flex-wrap gap-2">
        {inv.pdfUrl && (
          <Button size="sm" variant="outline" onClick={onDownload}>
            PDF herunterladen
          </Button>
        )}
        {state.kind !== "club_confirmed" && (
          <Button
            size="sm"
            variant={state.kind === "sponsor_marked" ? "outline" : "default"}
            onClick={handleToggle}
            disabled={pending}
          >
            {state.kind === "sponsor_marked"
              ? "Markierung zurücknehmen"
              : "Habe bezahlt"}
          </Button>
        )}
      </div>
    </li>
  );
}

function PayPill({ state }: { state: PayState }) {
  const cfg =
    state.kind === "club_confirmed"
      ? {
          label: `Bezahlt · Verein bestätigt ${state.at.toLocaleDateString("de-DE")}`,
          cls: "bg-emerald-100 text-emerald-800"
        }
      : state.kind === "sponsor_marked"
        ? {
            label: `Bezahlt · warte auf Vereinsbestätigung`,
            cls: "bg-amber-100 text-amber-800"
          }
        : { label: "Offen", cls: "bg-neutral-100 text-neutral-700" };
  return (
    <span
      className={
        "mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold " +
        cfg.cls
      }
    >
      {cfg.label}
    </span>
  );
}
