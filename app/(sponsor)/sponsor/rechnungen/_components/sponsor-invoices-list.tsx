"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DataTable, type DataTableColumn, type SortDirection } from "@/components/ui/data-table";
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

interface SponsorInvoicesListProps {
  invoices: Row[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort?: "period" | "totalCents" | "status";
  dir?: SortDirection;
}

export function SponsorInvoicesList({
  invoices,
  page,
  pageSize,
  total,
  totalPages,
  sort,
  dir
}: SponsorInvoicesListProps) {
  async function handleDownload(id: string) {
    try {
      const url = await invoiceDownloadUrl(id);
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download fehlgeschlagen");
    }
  }

  const columns: Array<DataTableColumn<Row>> = [
    {
      key: "period",
      label: "Periode",
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-mono tabular-nums text-xs uppercase tracking-wider text-brand-night-navy/60">
            {row.period}
          </div>
          <div className="mt-0.5 font-display font-bold text-sm md:text-base tracking-tight text-brand-night-navy">
            {row.clubName}
          </div>
          {row.sentAt && (
            <div className="text-[0.65rem] text-brand-night-navy/40">
              Versendet {new Date(row.sentAt).toLocaleDateString("de-DE")}
            </div>
          )}
        </div>
      )
    },
    {
      key: "totalCents",
      label: "Betrag",
      sortable: true,
      align: "right",
      render: (row) => (
        <span className="font-mono tabular-nums font-semibold text-accent-dark">
          {eur(row.totalCents)}
        </span>
      )
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => <PayPill state={payState(row)} />
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (row) => <RowActions row={row} onDownload={() => handleDownload(row.id)} />
    }
  ];

  return (
    <DataTable<Row>
      rows={invoices}
      columns={columns}
      page={page}
      pageSize={pageSize}
      total={total}
      totalPages={totalPages}
      sort={sort}
      dir={dir}
      emptyState="Keine Rechnungen auf dieser Seite."
    />
  );
}

function RowActions({ row, onDownload }: { row: Row; onDownload: () => void }) {
  const [pending, startTransition] = useTransition();
  const state = payState(row);

  function handleToggle() {
    startTransition(async () => {
      try {
        const res = await markInvoicePaidBySponsor(row.id);
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
    <div className="inline-flex gap-1 md:gap-2">
      {row.pdfUrl && (
        <Button size="sm" variant="outline" onClick={onDownload} className="text-xs">
          PDF
        </Button>
      )}
      {state.kind !== "club_confirmed" && (
        <Button
          size="sm"
          variant={state.kind === "sponsor_marked" ? "outline" : "default"}
          onClick={handleToggle}
          disabled={pending}
          className="text-xs"
        >
          {state.kind === "sponsor_marked" ? "Rückgängig" : "Bezahlt"}
        </Button>
      )}
    </div>
  );
}

function PayPill({ state }: { state: PayState }) {
  const cfg =
    state.kind === "club_confirmed"
      ? {
          label: `Bezahlt · bestätigt ${state.at.toLocaleDateString("de-DE")}`,
          cls: "bg-emerald-100 text-emerald-800"
        }
      : state.kind === "sponsor_marked"
        ? {
            label: `Bezahlt · warte auf Verein`,
            cls: "bg-amber-100 text-amber-800"
          }
        : { label: "Offen", cls: "bg-neutral-100 text-neutral-700" };
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold " +
        cfg.cls
      }
    >
      {cfg.label}
    </span>
  );
}
