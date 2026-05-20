"use client";

import { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { TRIGGER_META } from "@/lib/triggers/labels";
import type { ClubPledgeRow } from "@/lib/db/queries/club-dashboard";

type ScopeFilter = "all" | "match" | "season";
type StatusFilter = "all" | "active" | "paused" | "ended";

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR"
  });
}

function triggerLabel(t: string) {
  return (TRIGGER_META as Record<string, { label: string; emoji: string } | undefined>)[t];
}

export function PledgesTable({
  rows,
  teams
}: {
  rows: ClubPledgeRow[];
  teams: Array<{ id: string; name: string }>;
}) {
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (teamFilter !== "all" && r.teamId !== teamFilter) return false;
      if (scopeFilter !== "all" && r.triggerScope !== scopeFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      return true;
    });
  }, [rows, teamFilter, scopeFilter, statusFilter]);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3 md:mb-4">
        <h2 className="font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy">
          Aktuelle Sponsoren-Wetten
        </h2>
        <span className="text-xs text-brand-night-navy/50">
          {filtered.length} von {rows.length}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 md:gap-3 mb-3 md:mb-4">
        <FilterSelect
          label="Mannschaft"
          value={teamFilter}
          onChange={setTeamFilter}
          options={[
            { value: "all", label: "Alle Mannschaften" },
            ...teams.map((t) => ({ value: t.id, label: t.name }))
          ]}
        />
        <FilterSelect
          label="Trigger-Kategorie"
          value={scopeFilter}
          onChange={(v) => setScopeFilter(v as ScopeFilter)}
          options={[
            { value: "all", label: "Alle" },
            { value: "match", label: "Pro Spiel" },
            { value: "season", label: "Pro Saison" }
          ]}
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          options={[
            { value: "all", label: "Alle" },
            { value: "active", label: "Aktiv" },
            { value: "paused", label: "Pausiert" },
            { value: "ended", label: "Beendet" }
          ]}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-6 text-sm text-brand-night-navy/60">
          Keine Sponsoren-Wetten passen zu den Filtern.
        </div>
      ) : (
        <>
          {/* Desktop-Tabelle */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-brand-neutral/40 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-brand-off-white text-[0.65rem] md:text-xs uppercase tracking-wider text-brand-night-navy/60">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Sponsor</th>
                  <th className="px-4 py-3 text-left font-semibold">Mannschaft</th>
                  <th className="px-4 py-3 text-left font-semibold">Trigger</th>
                  <th className="px-4 py-3 text-right font-semibold">Pro Event</th>
                  <th className="px-4 py-3 text-right font-semibold">Bisher</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-neutral/30">
                {filtered.map((r) => {
                  const meta = triggerLabel(r.triggerType);
                  return (
                    <tr
                      key={`${r.pledgeId}-${r.triggerType}-${r.amountCents}`}
                      className="hover:bg-brand-off-white/60"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-brand-night-navy">
                          {r.sponsorDisplayName}
                        </div>
                        <div className="text-xs text-brand-night-navy/50 truncate">
                          {r.sponsorEmail}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-brand-night-navy">{r.teamName}</td>
                      <td className="px-4 py-3 text-brand-night-navy">
                        <span className="mr-1.5">{meta?.emoji ?? "💚"}</span>
                        {meta?.label ?? r.triggerType}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-brand-night-navy">
                        {eur(r.amountCents)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-brand-night-navy">
                        {eur(r.chargedCents)}
                      </td>
                      <td className="px-4 py-3">
                        <PledgeStatusBadge status={r.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile-Cards */}
          <ul className="md:hidden space-y-2">
            {filtered.map((r) => {
              const meta = triggerLabel(r.triggerType);
              return (
                <li
                  key={`m-${r.pledgeId}-${r.triggerType}-${r.amountCents}`}
                  className="rounded-xl border border-brand-neutral/40 bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-brand-night-navy truncate">
                        {r.sponsorDisplayName}
                      </div>
                      <div className="text-[0.65rem] text-brand-night-navy/50 truncate">
                        {r.sponsorEmail}
                      </div>
                    </div>
                    <PledgeStatusBadge status={r.status} />
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-brand-night-navy/70">
                    <span>{meta?.emoji ?? "💚"}</span>
                    <span className="truncate">{meta?.label ?? r.triggerType}</span>
                    <span className="text-brand-night-navy/40">·</span>
                    <span className="truncate">{r.teamName}</span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between text-xs">
                    <span className="text-brand-night-navy/50">Pro Event</span>
                    <span className="font-mono tabular-nums text-brand-night-navy">
                      {eur(r.amountCents)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-brand-night-navy/50">Bisher gecharged</span>
                    <span className="font-mono tabular-nums font-semibold text-brand-night-navy">
                      {eur(r.chargedCents)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block">
      <span className="block text-[0.65rem] md:text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50 mb-1">
        {label}
      </span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="bg-white">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function PledgeStatusBadge({ status }: { status: "active" | "paused" | "ended" }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "Aktiv", cls: "bg-emerald-100 text-emerald-800" },
    paused: { label: "Pausiert", cls: "bg-amber-100 text-amber-800" },
    ended: { label: "Beendet", cls: "bg-neutral-100 text-neutral-600" }
  };
  const entry = map[status] ?? { label: status, cls: "bg-neutral-100 text-neutral-600" };
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
