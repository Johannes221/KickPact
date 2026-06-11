"use client";

import Link from "next/link";
import {
  DataTable,
  type DataTableColumn,
  type SortDirection
} from "@/components/ui/data-table";
import { triggerEmoji, triggerLabel } from "@/lib/triggers/labels";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { ClubChargeRow } from "@/lib/db/queries/club-reporting";
import { eur } from "@/lib/utils/currency";

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  });
}

const STATUS_MAP: Record<string, { label: string; tone: BadgeProps["tone"] }> = {
  pending_approval: { label: "Offen", tone: "warning" },
  confirmed: { label: "Bestätigt", tone: "success" },
  invoiced: { label: "Abgerechnet", tone: "info" },
  cancelled: { label: "Storniert", tone: "neutral" }
};

interface Props {
  rows: ClubChargeRow[];
  slug: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort?:
    | "matchDate"
    | "amountCents"
    | "status"
    | "triggerType"
    | "teamName"
    | "sponsorDisplayName";
  dir?: SortDirection;
}

export function SponsorChargesTable({
  rows,
  slug,
  page,
  pageSize,
  total,
  totalPages,
  sort,
  dir
}: Props) {
  const columns: Array<DataTableColumn<ClubChargeRow>> = [
    {
      key: "matchDate",
      label: "Datum",
      sortable: true,
      render: (r) => (
        <span className="font-mono tabular-nums">{fmtDate(r.matchDate)}</span>
      )
    },
    {
      key: "teamName",
      label: "Team",
      sortable: true,
      render: (r) => (
        <Link
          href={`/verein/${slug}/mannschaft/${r.teamId}`}
          className="hover:underline"
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
          <span>{triggerLabel(r.triggerType)}</span>
        </span>
      )
    },
    {
      key: "amountCents",
      label: "Betrag",
      sortable: true,
      align: "right",
      render: (r) => (
        <span className="font-mono tabular-nums font-semibold">
          {eur(r.amountCents)}
        </span>
      )
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (r) => {
        const e = STATUS_MAP[r.status] ?? { label: r.status, tone: "neutral" as const };
        return <Badge tone={e.tone}>{e.label}</Badge>;
      }
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (r) =>
        r.matchId ? (
          <Link
            href={`/verein/${slug}/spiel/${r.matchId}`}
            className="text-xs font-semibold text-accent-dark hover:underline"
          >
            Spiel ›
          </Link>
        ) : null
    }
  ];

  return (
    <DataTable<ClubChargeRow>
      rows={rows}
      columns={columns}
      page={page}
      pageSize={pageSize}
      total={total}
      totalPages={totalPages}
      sort={sort}
      dir={dir}
      emptyState="Noch keine Beiträge für diesen Sponsor."
    />
  );
}
