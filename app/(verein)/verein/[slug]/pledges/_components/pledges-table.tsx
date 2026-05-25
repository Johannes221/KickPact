"use client";

import Link from "next/link";
import {
  DataTable,
  type DataTableColumn,
  type SortDirection
} from "@/components/ui/data-table";
import { triggerEmoji, triggerLabel } from "@/lib/triggers/labels";
import type { ClubPledgeReportRow } from "@/lib/db/queries/club-reporting";

function eur(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR"
  });
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  });
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  active: { label: "Aktiv", cls: "bg-emerald-100 text-emerald-800" },
  paused: { label: "Pausiert", cls: "bg-amber-100 text-amber-800" },
  ended: { label: "Beendet", cls: "bg-neutral-100 text-neutral-500" }
};

function StatusBadge({ status }: { status: string }) {
  const entry = STATUS_MAP[status] ?? {
    label: status,
    cls: "bg-neutral-100 text-neutral-700"
  };
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

function CapBar({
  used,
  cap
}: {
  used: number;
  cap: number | null;
}) {
  if (!cap || cap <= 0) {
    return (
      <span className="text-xs text-brand-night-navy/40 font-mono tabular-nums">
        kein Cap
      </span>
    );
  }
  const pct = Math.min(100, Math.round((used / cap) * 100));
  const tone =
    pct >= 90
      ? "bg-rose-500"
      : pct >= 75
        ? "bg-amber-500"
        : "bg-accent";
  return (
    <div className="min-w-[6rem]">
      <div className="flex items-center justify-between text-[0.65rem] tabular-nums text-brand-night-navy/60">
        <span>{pct}%</span>
        <span>{eur(used)}</span>
      </div>
      <div className="mt-0.5 h-1.5 w-full rounded-full bg-brand-neutral/30 overflow-hidden">
        <div
          className={"h-full " + tone}
          style={{ width: `${pct}%` }}
          aria-label={`${pct}% von ${eur(cap)} verbraucht`}
        />
      </div>
    </div>
  );
}

interface PledgesTableProps {
  rows: ClubPledgeReportRow[];
  slug: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort?:
    | "createdAt"
    | "amountCents"
    | "status"
    | "triggerType"
    | "sponsorDisplayName"
    | "teamName"
    | "capUsage";
  dir?: SortDirection;
}

export function PledgesTable({
  rows,
  slug,
  page,
  pageSize,
  total,
  totalPages,
  sort,
  dir
}: PledgesTableProps) {
  const columns: Array<DataTableColumn<ClubPledgeReportRow>> = [
    {
      key: "sponsorDisplayName",
      label: "Sponsor",
      sortable: true,
      render: (r) => (
        <Link
          href={`/verein/${slug}/sponsor/${r.sponsorId}`}
          className="block min-w-0 hover:underline"
        >
          <div className="font-medium truncate">{r.sponsorDisplayName}</div>
          <div className="text-xs text-brand-night-navy/50 truncate max-w-[16ch] sm:max-w-none">
            {r.sponsorEmail}
          </div>
        </Link>
      )
    },
    {
      key: "teamName",
      label: "Team",
      sortable: true,
      render: (r) => (
        <Link
          href={`/verein/${slug}/mannschaft/${r.teamId}`}
          className="text-brand-night-navy hover:underline"
        >
          {r.teamName}
        </Link>
      )
    },
    {
      key: "triggerType",
      label: "Trigger",
      sortable: true,
      render: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden>{triggerEmoji(r.triggerType)}</span>
          <span className="truncate max-w-[14ch] sm:max-w-none">
            {triggerLabel(r.triggerType)}
          </span>
        </span>
      )
    },
    {
      key: "amountCents",
      label: "€ / Event",
      sortable: true,
      align: "right",
      render: (r) => (
        <span className="font-mono tabular-nums">{eur(r.amountCents)}</span>
      )
    },
    {
      key: "monthlyCapCents",
      label: "Monats-Cap",
      align: "right",
      render: (r) => (
        <span className="font-mono tabular-nums text-brand-night-navy/70">
          {eur(r.monthlyCapCents)}
        </span>
      )
    },
    {
      key: "capUsage",
      label: "Cap-Auslastung",
      sortable: true,
      render: (r) => <CapBar used={r.monthChargedCents} cap={r.monthlyCapCents} />
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (r) => <StatusBadge status={r.status} />
    },
    {
      key: "dates",
      label: "Laufzeit",
      render: (r) => (
        <span className="font-mono tabular-nums text-xs text-brand-night-navy/70 whitespace-nowrap">
          {fmtDate(r.startsAt)} – {fmtDate(r.endsAt)}
        </span>
      )
    }
  ];

  return (
    <DataTable<ClubPledgeReportRow>
      rows={rows}
      columns={columns}
      getRowKey={(r) => r.ruleId}
      page={page}
      pageSize={pageSize}
      total={total}
      totalPages={totalPages}
      sort={sort}
      dir={dir}
      emptyState="Keine Pledges für die aktuellen Filter."
    />
  );
}
