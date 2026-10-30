"use client";

import { useRouter } from "next/navigation";
import {
  DataTable,
  type DataTableColumn,
  type SortDirection
} from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import type { AdminVereinRow, AdminVereinSortKey } from "@/lib/db/queries/platform-stats";

const STATUS_LABEL: Record<string, string> = {
  trialing: "Trial",
  active: "Aktiv",
  past_due: "Past Due",
  cancelled: "Cancelled",
  incomplete: "Incomplete",
  paused: "Pausiert"
};

const STATUS_PILL_CLASS: Record<string, string> = {
  trialing: "bg-blue-50 text-blue-800 border-blue-200",
  active: "bg-emerald-50 text-emerald-800 border-emerald-200",
  past_due: "bg-amber-50 text-amber-800 border-amber-200",
  cancelled: "bg-rose-50 text-rose-800 border-rose-200",
  incomplete: "bg-slate-50 text-slate-700 border-slate-200",
  paused: "bg-violet-50 text-violet-800 border-violet-200"
};

function StatusPill({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[0.7rem] font-medium text-slate-600">
        —
      </span>
    );
  }
  const cls = STATUS_PILL_CLASS[status] ?? "bg-slate-50 text-slate-700 border-slate-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.7rem] font-medium ${cls}`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

interface VereineTableProps {
  rows: AdminVereinRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort?: AdminVereinSortKey;
  dir?: SortDirection;
}

export function VereineTable({
  rows,
  page,
  pageSize,
  total,
  totalPages,
  sort,
  dir
}: VereineTableProps) {
  const router = useRouter();

  const columns: Array<DataTableColumn<AdminVereinRow>> = [
    {
      key: "name",
      label: "Name",
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-display font-bold text-brand-night-navy">{row.name}</div>
          <div className="text-[0.7rem] text-brand-night-navy/50 font-mono">{row.slug}</div>
        </div>
      )
    },
    {
      key: "ort",
      label: "Ort",
      sortable: true,
      render: (row) => row.ort ?? "—"
    },
    {
      key: "topPlan",
      label: "Plan",
      render: (row) => (
        <span className="font-mono text-xs uppercase tracking-wider">
          {row.topPlan ?? "—"}
        </span>
      )
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => <StatusPill status={row.subscriptionStatus} />
    },
    {
      key: "pendingRequestCount",
      label: "Anfragen",
      align: "right",
      render: (row) =>
        row.pendingRequestCount > 0 ? (
          <Badge tone="warning">{row.pendingRequestCount}</Badge>
        ) : (
          <span className="text-brand-night-navy/40">—</span>
        )
    },
    {
      key: "verified",
      label: "Verifiziert",
      render: (row) =>
        row.verifiedAt ? (
          <span className="text-emerald-700">✓</span>
        ) : (
          <span className="text-brand-night-navy/60">—</span>
        )
    },
    {
      key: "teamCount",
      label: "Teams",
      align: "right",
      render: (row) => (
        <span className="font-mono tabular-nums">{row.teamCount}</span>
      )
    },
    {
      key: "memberCount",
      label: "Mitgl.",
      align: "right",
      render: (row) => (
        <span className="font-mono tabular-nums">{row.memberCount}</span>
      )
    },
    {
      key: "sponsorCount",
      label: "Spons.",
      align: "right",
      render: (row) => (
        <span className="font-mono tabular-nums">{row.sponsorCount}</span>
      )
    },
    {
      key: "createdAt",
      label: "Erstellt",
      sortable: true,
      render: (row) => (
        <span className="text-xs text-brand-night-navy/60 font-mono tabular-nums">
          {new Date(row.createdAt).toLocaleDateString("de-DE")}
        </span>
      )
    }
  ];

  return (
    <DataTable<AdminVereinRow>
      rows={rows}
      columns={columns}
      page={page}
      pageSize={pageSize}
      total={total}
      totalPages={totalPages}
      sort={sort}
      dir={dir}
      onRowClick={(row) => router.push(`/admin/vereine/${row.slug}`)}
      emptyState="Keine Vereine zu diesem Filter."
    />
  );
}
