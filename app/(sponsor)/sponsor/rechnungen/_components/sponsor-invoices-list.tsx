"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { openInNewTab } from "@/lib/platform/files";
import { DataTable, type DataTableColumn, type SortDirection } from "@/components/ui/data-table";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { invoiceDownloadUrl, markInvoicePaidBySponsor } from "@/lib/actions/invoices";
import { eur } from "@/lib/utils/currency";

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
      await openInNewTab(url, `zahlungsuebersicht-${id}.pdf`);
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
            <div className="text-[0.65rem] text-brand-night-navy/60">
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
      emptyState="Keine Zahlungsübersichten auf dieser Seite."
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
  const cfg: { label: string; tone: BadgeProps["tone"] } =
    state.kind === "club_confirmed"
      ? {
          label: `Bezahlt · bestätigt ${state.at.toLocaleDateString("de-DE")}`,
          tone: "success"
        }
      : state.kind === "sponsor_marked"
        ? { label: `Bezahlt · warte auf Verein`, tone: "warning" }
        : { label: "Offen", tone: "neutral" };
  return <Badge tone={cfg.tone}>{cfg.label}</Badge>;
}
