"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { eur } from "@/lib/utils/currency";
import {
  createCorrectionAction,
  dismissCorrectionAction
} from "../_actions/correction";

export interface CorrectionItem {
  chargeId: string;
  amountCents: number;
  triggerText: string;
  matchLabel: string;
  matchDate: Date | null;
  flaggedAt: Date | null;
}

export interface CorrectionGroup {
  invoiceId: string;
  invoiceNumber: string | null;
  invoicePeriod: string;
  invoiceStatus: string;
  canCredit: boolean;
  sponsorName: string;
  sponsorEmail: string | null;
  clubName: string;
  items: CorrectionItem[];
}

function GroupCard({ group }: { group: CorrectionGroup }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(group.items.map((i) => i.chargeId))
  );

  const selectedIds = useMemo(() => [...selected], [selected]);
  const selectedSum = group.items
    .filter((i) => selected.has(i.chargeId))
    .reduce((s, i) => s + i.amountCents, 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onCredit() {
    if (selectedIds.length === 0) return;
    if (
      !window.confirm(
        `Gutschrift über ${eur(-selectedSum)} für ${selectedIds.length} Charge(s) erzeugen? ` +
          `Es entsteht ein Korrekturbeleg; die betroffenen Charges werden storniert. ` +
          `Die Original-Rechnung ${group.invoiceNumber ?? ""} bleibt für die übrigen Zeilen gültig.`
      )
    )
      return;
    startTransition(async () => {
      const res = await createCorrectionAction({
        invoiceId: group.invoiceId,
        chargeIds: selectedIds
      });
      if (res.ok) {
        toast.success(`Gutschrift ${res.stornoNumber} erstellt`);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function onDismiss() {
    if (selectedIds.length === 0) return;
    if (
      !window.confirm(
        `Markierung für ${selectedIds.length} Charge(s) verwerfen? ` +
          `Nutze das nur, wenn die Ergebnis-Änderung ein Scrape-Fehler war und keine Gutschrift nötig ist.`
      )
    )
      return;
    startTransition(async () => {
      const res = await dismissCorrectionAction({ chargeIds: selectedIds });
      if (res.ok) {
        toast.success("Markierung verworfen");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <li className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-display text-lg font-black tracking-tight text-brand-night-navy">
            {group.clubName} → {group.sponsorName}
          </div>
          <div className="text-xs text-brand-night-navy/60">
            Rechnung{" "}
            <span className="font-mono">{group.invoiceNumber ?? group.invoiceId}</span> ·{" "}
            {group.invoicePeriod} · Status {group.invoiceStatus}
            {group.sponsorEmail ? (
              <>
                {" "}
                · <span className="font-mono">{group.sponsorEmail}</span>
              </>
            ) : null}
          </div>
        </div>
        {!group.canCredit && (
          <span className="rounded-full bg-amber-100 px-2 py-1 text-[0.65rem] font-semibold text-amber-700">
            Nicht versendet — nur Verwerfen
          </span>
        )}
      </div>

      <ul className="mb-4 divide-y divide-amber-200/70 rounded-xl border border-brand-neutral/40 bg-white">
        {group.items.map((it) => (
          <li key={it.chargeId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <input
              type="checkbox"
              checked={selected.has(it.chargeId)}
              onChange={() => toggle(it.chargeId)}
              disabled={pending}
              className="h-4 w-4 shrink-0 accent-rose-600"
              aria-label={`Charge ${it.chargeId} auswählen`}
            />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold text-brand-night-navy">
                {it.triggerText} · {eur(it.amountCents)}
              </div>
              <div className="truncate text-xs text-brand-night-navy/60">
                {it.matchLabel}
                {it.matchDate ? ` · ${it.matchDate.toLocaleDateString("de-DE")}` : ""}
                {it.flaggedAt
                  ? ` · markiert ${it.flaggedAt.toLocaleDateString("de-DE")}`
                  : ""}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending || !group.canCredit || selectedIds.length === 0}
          onClick={onCredit}
          className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Gutschrift erstellen ({eur(-selectedSum)})
        </button>
        <button
          type="button"
          disabled={pending || selectedIds.length === 0}
          onClick={onDismiss}
          className="rounded-md border border-brand-neutral/40 px-3 py-1.5 text-xs font-semibold text-brand-night-navy/70 hover:bg-brand-off-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Verwerfen
        </button>
        <span className="text-xs text-brand-night-navy/50">
          {selectedIds.length}/{group.items.length} ausgewählt
        </span>
      </div>
    </li>
  );
}

export function CorrectionsTable({ groups }: { groups: CorrectionGroup[] }) {
  return (
    <ul className="space-y-4">
      {groups.map((g) => (
        <GroupCard key={g.invoiceId} group={g} />
      ))}
    </ul>
  );
}
