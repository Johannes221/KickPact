"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { markInvoicePaid, invoiceDownloadUrl } from "@/lib/actions/invoices";

interface Row {
  id: string;
  period: string;
  totalCents: number;
  status: string;
  pdfUrl: string | null;
  sponsorId: string;
  sponsorDisplayName: string;
  sponsorType: string;
  sponsorEmail: string;
  sentAt: Date | null;
  paidMarkedAt: Date | null;
  createdAt: Date;
}

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export function InvoicesTable({
  invoices,
  canMarkPaid
}: {
  invoices: Row[];
  canMarkPaid: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleMarkPaid(id: string) {
    setBusyId(id);
    startTransition(async () => {
      try {
        await markInvoicePaid(id);
        toast.success("Als bezahlt markiert.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler beim Markieren");
      } finally {
        setBusyId(null);
      }
    });
  }

  async function handleDownload(id: string) {
    try {
      const url = await invoiceDownloadUrl(id);
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download fehlgeschlagen");
    }
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-brand-neutral/40 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-brand-off-white text-[0.65rem] md:text-xs uppercase tracking-wider text-brand-night-navy/60">
          <tr>
            <th className="px-3 md:px-4 py-3 text-left font-semibold">Periode</th>
            <th className="px-3 md:px-4 py-3 text-left font-semibold">Sponsor</th>
            <th className="px-3 md:px-4 py-3 text-right font-semibold">Betrag</th>
            <th className="px-3 md:px-4 py-3 text-left font-semibold">Status</th>
            <th className="px-3 md:px-4 py-3 text-right font-semibold">&nbsp;</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-neutral/30">
          {invoices.map((inv) => (
            <tr key={inv.id} className="hover:bg-brand-off-white/60">
              <td className="px-3 md:px-4 py-3 font-mono tabular-nums text-brand-night-navy">
                {inv.period}
              </td>
              <td className="px-3 md:px-4 py-3 text-brand-night-navy">
                <div className="font-medium">{inv.sponsorDisplayName}</div>
                <div className="text-xs text-brand-night-navy/50 truncate max-w-[16ch] sm:max-w-none">
                  {inv.sponsorEmail}
                </div>
              </td>
              <td className="px-3 md:px-4 py-3 text-right font-mono tabular-nums font-semibold text-brand-night-navy">
                {eur(inv.totalCents)}
              </td>
              <td className="px-3 md:px-4 py-3">
                <StatusBadge status={inv.status} />
              </td>
              <td className="px-3 md:px-4 py-3 text-right whitespace-nowrap">
                <div className="inline-flex gap-1 md:gap-2">
                  {inv.pdfUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDownload(inv.id)}
                      className="text-xs"
                    >
                      PDF
                    </Button>
                  )}
                  {canMarkPaid && inv.status !== "paid" && (
                    <Button
                      size="sm"
                      variant="accent"
                      disabled={isPending && busyId === inv.id}
                      onClick={() => handleMarkPaid(inv.id)}
                      className="text-xs"
                    >
                      {isPending && busyId === inv.id ? "…" : "Bezahlt"}
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft: { label: "Entwurf", cls: "bg-neutral-100 text-neutral-700" },
    sent: { label: "Versendet", cls: "bg-accent/10 text-accent-dark" },
    paid: { label: "Bezahlt", cls: "bg-emerald-100 text-emerald-800" },
    overdue: { label: "Überfällig", cls: "bg-rose-100 text-rose-700" },
    cancelled: { label: "Storniert", cls: "bg-neutral-100 text-neutral-500" }
  };
  const entry = map[status] ?? { label: status, cls: "bg-neutral-100 text-neutral-700" };
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] md:text-xs font-semibold " +
        entry.cls
      }
    >
      {entry.label}
    </span>
  );
}
