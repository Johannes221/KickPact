"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DataTable,
  type DataTableColumn,
  type SortDirection
} from "@/components/ui/data-table";
import { triggerEmoji, triggerLabel } from "@/lib/triggers/labels";
import { abbreviateTeamName } from "@/lib/utils/team-name";
import type { ClubChargeRow } from "@/lib/db/queries/club-reporting";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cancelChargeAction } from "../_actions/cancel";

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR"
  });
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit"
  });
}

interface ChargesTableProps {
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
    | "sponsorDisplayName"
    | "teamName";
  dir?: SortDirection;
  /** When true, a cancel button is shown for confirmed/pending charges. */
  canEdit?: boolean;
}

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  pending_approval: {
    label: "Bestätigung offen",
    cls: "bg-amber-100 text-amber-800"
  },
  confirmed: { label: "Bestätigt", cls: "bg-emerald-100 text-emerald-800" },
  invoiced: { label: "Abgerechnet", cls: "bg-sky-100 text-sky-800" },
  cancelled: { label: "Storniert", cls: "bg-neutral-100 text-neutral-500" }
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

/** Whether a charge in this status can still be cancelled. */
function isCancellable(status: string): boolean {
  return status === "confirmed" || status === "pending_approval";
}

export function ChargesTable({
  rows,
  slug,
  page,
  pageSize,
  total,
  totalPages,
  sort,
  dir,
  canEdit = false
}: ChargesTableProps) {
  const [pending, startTransition] = useTransition();
  // The charge currently targeted by the cancel dialog
  const [cancelTarget, setCancelTarget] = useState<ClubChargeRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  function openCancel(row: ClubChargeRow) {
    setCancelTarget(row);
    setCancelReason("");
  }

  function handleConfirmCancel() {
    if (!cancelTarget) return;
    const target = cancelTarget;
    setCancelTarget(null);
    startTransition(async () => {
      const res = await cancelChargeAction({
        clubSlug: slug,
        chargeId: target.id,
        reason: cancelReason || undefined
      });
      if (!res.ok) toast.error(res.error);
      else toast.success("Charge storniert.");
    });
  }

  const columns: Array<DataTableColumn<ClubChargeRow>> = [
    {
      key: "matchDate",
      label: "Datum",
      sortable: true,
      render: (r) => (
        <div className="min-w-0">
          <div className="font-mono tabular-nums text-brand-night-navy">
            {fmtDate(r.matchDate)}
          </div>
          {r.heimName && r.gastName && (
            <div
              className="text-xs text-brand-night-navy/50 truncate max-w-[18ch] sm:max-w-none"
              title={`${r.heimName} – ${r.gastName}`}
            >
              {abbreviateTeamName(r.heimName)} – {abbreviateTeamName(r.gastName)}
            </div>
          )}
        </div>
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
      key: "sponsorDisplayName",
      label: "Sponsor",
      sortable: true,
      render: (r) => (
        <Link
          href={`/verein/${slug}/sponsor/${r.sponsorId}`}
          className="min-w-0 block hover:underline"
        >
          <div className="font-medium truncate">{r.sponsorDisplayName}</div>
          <div className="text-xs text-brand-night-navy/50 truncate max-w-[16ch] sm:max-w-none">
            {r.sponsorEmail}
          </div>
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
      render: (r) => <StatusBadge status={r.status} />
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          {r.matchId && (
            <Link
              href={`/verein/${slug}/spiel/${r.matchId}`}
              className="text-xs font-semibold text-accent-dark hover:underline"
            >
              Spiel ›
            </Link>
          )}
          {canEdit && isCancellable(r.status) && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-brand-night-navy/40 hover:text-red-600 hover:bg-red-50"
              title="Charge stornieren"
              disabled={pending}
              onClick={() => openCancel(r)}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>
      )
    }
  ];

  return (
    <>
      <DataTable<ClubChargeRow>
        rows={rows}
        columns={columns}
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
        sort={sort}
        dir={dir}
        emptyState="Keine Charges für die aktuellen Filter."
      />

      {/* Storno-Bestätigungsdialog */}
      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(open) => { if (!open) setCancelTarget(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Charge stornieren?</DialogTitle>
            <DialogDescription>
              {cancelTarget && (
                <>
                  <strong>{cancelTarget.sponsorDisplayName}</strong> ·{" "}
                  {triggerEmoji(cancelTarget.triggerType)}{" "}
                  {triggerLabel(cancelTarget.triggerType)} ·{" "}
                  <strong>{eur(cancelTarget.amountCents)}</strong>
                  {cancelTarget.matchDate && (
                    <> · {fmtDate(cancelTarget.matchDate)}</>
                  )}
                  <br />
                  <span className="text-brand-night-navy/60 text-xs mt-1 block">
                    Bereits abgerechnete Charges können nicht storniert werden.
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-1.5">
            <Label htmlFor="cancel-reason" className="text-sm font-semibold">
              Grund (optional)
            </Label>
            <Textarea
              id="cancel-reason"
              placeholder="z.B. falsches Ergebnis, Korrektur …"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={2}
              maxLength={200}
              className="text-sm resize-none"
            />
          </div>

          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={pending}>
              Abbrechen
            </Button>
            <Button variant="destructive" onClick={handleConfirmCancel} disabled={pending}>
              {pending ? "…" : "Charge stornieren"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
