"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { openInNewTab } from "@/lib/platform/files";
import { DataTable, type DataTableColumn, type SortDirection } from "@/components/ui/data-table";
import { Badge, type BadgeProps } from "@/components/ui/badge";
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

interface InvoicesTableProps {
  invoices: Row[];
  canMarkPaid: boolean;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort?: "period" | "totalCents" | "status" | "sponsorDisplayName";
  dir?: SortDirection;
}

export function InvoicesTable({
  invoices,
  canMarkPaid,
  page,
  pageSize,
  total,
  totalPages,
  sort,
  dir
}: InvoicesTableProps) {
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
      await openInNewTab(url, `rechnung-${id}.pdf`);
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
        <span className="font-mono tabular-nums text-brand-night-navy">{row.period}</span>
      )
    },
    {
      key: "sponsorDisplayName",
      label: "Sponsor",
      sortable: true,
      render: (row) => (
        <div className="min-w-0">
          <div className="font-medium truncate">{row.sponsorDisplayName}</div>
          <div className="text-xs text-brand-night-navy/50 truncate max-w-[16ch] sm:max-w-none">
            {row.sponsorEmail}
          </div>
        </div>
      )
    },
    {
      key: "totalCents",
      label: "Betrag",
      sortable: true,
      align: "right",
      render: (row) => (
        <span className="font-mono tabular-nums font-semibold">{eur(row.totalCents)}</span>
      )
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => <StatusBadge status={row.status} />
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (row) => (
        <div className="inline-flex gap-1 md:gap-2 whitespace-nowrap">
          {row.pdfUrl && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDownload(row.id)}
              className="text-xs"
            >
              PDF
            </Button>
          )}
          {canMarkPaid && row.status !== "paid" && (
            <Button
              size="sm"
              variant="accent"
              disabled={isPending && busyId === row.id}
              onClick={() => handleMarkPaid(row.id)}
              className="text-xs"
            >
              {isPending && busyId === row.id ? "…" : "Bezahlt"}
            </Button>
          )}
        </div>
      )
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; tone: BadgeProps["tone"] }> = {
    draft: { label: "Entwurf", tone: "neutral" },
    sent: { label: "Versendet", tone: "info" },
    paid: { label: "Bezahlt", tone: "success" },
    overdue: { label: "Überfällig", tone: "danger" },
    cancelled: { label: "Storniert", tone: "neutral" }
  };
  const entry = map[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={entry.tone}>{entry.label}</Badge>;
}
