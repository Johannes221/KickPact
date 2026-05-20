"use client";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { invoiceDownloadUrl } from "@/lib/actions/invoices";

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
  createdAt: Date;
}

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
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
        <li
          key={inv.id}
          className="rounded-2xl border border-brand-neutral/40 bg-white p-4 md:p-5"
        >
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
                {inv.paidMarkedAt && (
                  <span className="ml-1 md:ml-2 text-emerald-700">
                    · bezahlt {new Date(inv.paidMarkedAt).toLocaleDateString("de-DE")}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="font-display font-black text-xl md:text-2xl tracking-tight text-accent-dark tabular-nums">
                {eur(inv.totalCents)}
              </div>
              <StatusBadge status={inv.status} />
            </div>
          </div>
          <div className="mt-3 md:mt-4 flex flex-wrap gap-2">
            {inv.pdfUrl && (
              <Button size="sm" variant="outline" onClick={() => handleDownload(inv.id)}>
                PDF herunterladen
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
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
        "mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold " +
        entry.cls
      }
    >
      {entry.label}
    </span>
  );
}
