"use client";

import Link from "next/link";
import {
  DataTable,
  type DataTableColumn,
  type SortDirection
} from "@/components/ui/data-table";
import { triggerLabel, triggerEmoji } from "@/lib/triggers/labels";
import { abbreviateTeamName } from "@/lib/utils/team-name";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { eur } from "@/lib/utils/currency";

interface Row {
  id: string;
  createdAt: Date;
  confirmedAt: Date | null;
  amountCents: number;
  triggerType: string;
  status: string;
  matchId: string | null;
  matchDate: Date | null;
  heimName: string | null;
  gastName: string | null;
  ergebnisHeim: number | null;
  ergebnisGast: number | null;
  saison: string | null;
  teamId: string;
  teamName: string;
  clubId: string;
  clubName: string;
  clubSlug: string;
}

function StatusPill({ status }: { status: string }) {
  const cfg: Record<string, { label: string; tone: BadgeProps["tone"] }> = {
    confirmed: { label: "Bestätigt", tone: "success" },
    invoiced: { label: "Berechnet", tone: "info" },
    pending_approval: { label: "Wartet", tone: "warning" },
    cancelled: { label: "Storniert", tone: "neutral" }
  };
  const c = cfg[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={c.tone}>{c.label}</Badge>;
}

export function SponsorChargesTable({
  rows,
  page,
  pageSize,
  total,
  totalPages,
  sort,
  dir
}: {
  rows: Row[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  sort?: "createdAt" | "amountCents" | "triggerType" | "status";
  dir?: SortDirection;
}) {
  const columns: Array<DataTableColumn<Row>> = [
    {
      key: "createdAt",
      label: "Datum",
      sortable: true,
      render: (r) => {
        const d = r.matchDate ?? r.createdAt;
        return (
          <div>
            <div className="font-mono tabular-nums text-xs text-brand-night-navy">
              {new Date(d).toLocaleDateString("de-DE", {
                day: "2-digit",
                month: "2-digit",
                year: "2-digit"
              })}
            </div>
            {r.saison && (
              <div className="text-[0.65rem] text-brand-night-navy/60">
                Saison {r.saison}
              </div>
            )}
          </div>
        );
      }
    },
    {
      key: "club",
      label: "Verein",
      render: (r) => (
        <Link
          href={`/verein/${r.clubSlug}`}
          className="font-medium hover:text-accent transition-colors"
        >
          {r.clubName}
        </Link>
      )
    },
    {
      key: "team",
      label: "Mannschaft",
      render: (r) => (
        <Link
          href={`/verein/${r.clubSlug}/mannschaft/${r.teamId}`}
          className="hover:text-accent transition-colors"
        >
          {r.teamName}
        </Link>
      )
    },
    {
      key: "match",
      label: "Spiel",
      render: (r) => {
        if (!r.heimName || !r.gastName) {
          return <span className="text-xs text-brand-night-navy/60">—</span>;
        }
        const hasResult = r.ergebnisHeim !== null && r.ergebnisGast !== null;
        return (
          <div className="text-xs">
            <div className="truncate max-w-[18ch]" title={`${r.heimName} vs. ${r.gastName}`}>
              {abbreviateTeamName(r.heimName)} vs. {abbreviateTeamName(r.gastName)}
            </div>
            {hasResult && (
              <div className="font-mono tabular-nums text-brand-night-navy/60">
                {r.ergebnisHeim}:{r.ergebnisGast}
              </div>
            )}
          </div>
        );
      }
    },
    {
      key: "triggerType",
      label: "Trigger",
      sortable: true,
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 text-xs">
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
        <span className="font-mono tabular-nums font-semibold text-accent-dark">
          {eur(r.amountCents)}
        </span>
      )
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (r) => <StatusPill status={r.status} />
    }
  ];

  return (
    <DataTable<Row>
      rows={rows}
      columns={columns}
      page={page}
      pageSize={pageSize}
      total={total}
      totalPages={totalPages}
      sort={sort}
      dir={dir}
      emptyState="Keine Beiträge auf dieser Seite — Filter angepasst?"
    />
  );
}
