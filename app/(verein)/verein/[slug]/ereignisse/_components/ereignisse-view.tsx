"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { EreignisRow } from "@/lib/db/queries/club-dashboard";

// Trigger-Labels (same as in pledge-builder)
const TRIGGER_LABELS: Record<string, { label: string; emoji: string }> = {
  goal_total: { label: "Pro Tor", emoji: "⚽" },
  goal_by_player: { label: "Spieler-Tor", emoji: "💎" },
  win: { label: "Pro Sieg", emoji: "🏆" },
  clean_sheet: { label: "Zu-Null-Sieg", emoji: "🛡️" },
  comeback_win: { label: "Comeback-Sieg", emoji: "🔥" },
  hattrick: { label: "Hattrick", emoji: "🎯" },
  special_goal: { label: "Spezial-Tor", emoji: "🎭" },
  goals_scored_min: { label: "Viele Tore", emoji: "🎉" },
  goal_diff_min: { label: "Hoher Sieg", emoji: "💪" },
  season_promotion: { label: "Aufstieg", emoji: "⬆️" },
  season_no_relegation: { label: "Klassenerhalt", emoji: "🛟" },
  season_champion: { label: "Meister", emoji: "👑" },
  season_table_position: { label: "Tabellenplatz", emoji: "🥇" },
  season_cup_round: { label: "Pokal-Runde", emoji: "🏆" },
  season_custom: { label: "Saison-Ziel", emoji: "🎺" },
};

function eur(cents: number) {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

type SortKey = "date" | "amount" | "type";
type SortDir = "asc" | "desc";

export function EreignisseView({
  rows,
  slug,
}: {
  rows: EreignisRow[];
  slug: string;
}) {
  const [filterType, setFilterType] = useState<string>("all");
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Unique trigger types + teams for filter dropdowns
  const triggerTypes = useMemo(
    () => [...new Set(rows.map((r) => r.triggerType))].sort(),
    [rows]
  );
  const teams = useMemo(
    () =>
      [...new Map(rows.filter((r) => r.teamId).map((r) => [r.teamId, r.teamName])).entries()].sort(
        (a, b) => (a[1] ?? "").localeCompare(b[1] ?? "")
      ),
    [rows]
  );

  // Filter + sort
  const filtered = useMemo(() => {
    let result = rows;
    if (filterType !== "all") result = result.filter((r) => r.triggerType === filterType);
    if (filterTeam !== "all") result = result.filter((r) => r.teamId === filterTeam);
    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date") cmp = (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
      if (sortKey === "amount") cmp = a.amountCents - b.amountCents;
      if (sortKey === "type") cmp = (a.triggerType ?? "").localeCompare(b.triggerType ?? "");
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [rows, filterType, filterTeam, sortKey, sortDir]);

  // Stats summary
  const totalCents = filtered.reduce((s, r) => s + r.amountCents, 0);
  const byType = useMemo(() => {
    const map = new Map<string, { count: number; cents: number }>();
    for (const r of rows) {
      const e = map.get(r.triggerType) ?? { count: 0, cents: 0 };
      map.set(r.triggerType, { count: e.count + 1, cents: e.cents + r.amountCents });
    }
    return [...map.entries()]
      .sort((a, b) => b[1].cents - a[1].cents)
      .slice(0, 4);
  }, [rows]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (sortDir === "desc" ? " ↓" : " ↑") : "";

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-6 text-sm text-brand-night-navy/60">
        Noch keine Ereignisse. Sobald Sponsoren aktiv sind und Spiele stattfinden, erscheinen hier alle ausgelösten Ereignisse.
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Top-4 Ereignistypen nach Gesamtbetrag */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        {byType.map(([type, { count, cents }]) => {
          const meta = TRIGGER_LABELS[type];
          return (
            <button
              key={type}
              onClick={() => setFilterType(filterType === type ? "all" : type)}
              className={
                "text-left rounded-xl border p-3 transition-colors " +
                (filterType === type
                  ? "border-accent bg-accent/5"
                  : "border-brand-neutral/40 bg-white hover:border-accent/40")
              }
            >
              <div className="text-lg">{meta?.emoji ?? "💚"}</div>
              <div className="mt-1 font-semibold text-xs text-brand-night-navy">{meta?.label ?? type}</div>
              <div className="mt-0.5 font-mono tabular-nums font-black text-sm text-accent">{eur(cents)}</div>
              <div className="text-[0.65rem] text-brand-night-navy/50">{count}×</div>
            </button>
          );
        })}
      </div>

      {/* Filter + Sort Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          className="rounded-lg border border-brand-neutral/40 bg-white px-3 py-1.5 text-sm text-brand-night-navy"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="all">Alle Ereignisse</option>
          {triggerTypes.map((t) => (
            <option key={t} value={t}>
              {TRIGGER_LABELS[t]?.emoji} {TRIGGER_LABELS[t]?.label ?? t}
            </option>
          ))}
        </select>
        {teams.length > 1 && (
          <select
            className="rounded-lg border border-brand-neutral/40 bg-white px-3 py-1.5 text-sm text-brand-night-navy"
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
          >
            <option value="all">Alle Mannschaften</option>
            {teams.map(([id, name]) => (
              <option key={id ?? ""} value={id ?? ""}>
                {name}
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-brand-night-navy/50 mr-1">Sortierung:</span>
          {(["date", "amount", "type"] as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => toggleSort(k)}
              className={
                "rounded px-2 py-1 text-xs font-semibold transition-colors " +
                (sortKey === k
                  ? "bg-brand-night-navy text-white"
                  : "bg-brand-neutral/20 text-brand-night-navy hover:bg-brand-neutral/40")
              }
            >
              {k === "date" ? "Datum" : k === "amount" ? "Betrag" : "Typ"}
              {sortKey === k ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
            </button>
          ))}
        </div>
        <div className="text-xs text-brand-night-navy/50 ml-1">
          {filtered.length} Ereignisse · <strong>{eur(totalCents)}</strong>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-brand-neutral/40 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-brand-off-white text-xs uppercase tracking-wider text-brand-night-navy/60">
            <tr>
              <th
                className="px-4 py-3 text-left font-semibold cursor-pointer hover:text-brand-night-navy"
                onClick={() => toggleSort("date")}
              >
                Datum{SortIcon({ k: "date" })}
              </th>
              <th
                className="px-4 py-3 text-left font-semibold cursor-pointer hover:text-brand-night-navy"
                onClick={() => toggleSort("type")}
              >
                Ereignis{SortIcon({ k: "type" })}
              </th>
              <th className="px-4 py-3 text-left font-semibold">Spiel</th>
              <th className="px-4 py-3 text-left font-semibold">Sponsor</th>
              <th
                className="px-4 py-3 text-right font-semibold cursor-pointer hover:text-brand-night-navy"
                onClick={() => toggleSort("amount")}
              >
                Betrag{SortIcon({ k: "amount" })}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-neutral/30">
            {filtered.map((r) => {
              const meta = TRIGGER_LABELS[r.triggerType];
              return (
                <tr key={r.chargeId} className="relative hover:bg-brand-off-white/60">
                  <td className="px-4 py-3 font-mono tabular-nums text-brand-night-navy/70 text-xs">
                    {r.matchDatum
                      ? new Date(r.matchDatum).toLocaleDateString("de-DE")
                      : new Date(r.createdAt).toLocaleDateString("de-DE")}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-brand-night-navy">
                      <span>{meta?.emoji ?? "💚"}</span>
                      <span>{meta?.label ?? r.triggerType}</span>
                    </span>
                    {r.teamName && (
                      <div className="text-xs text-brand-night-navy/40 mt-0.5">{r.teamName}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-brand-night-navy/70">
                    {r.matchId ? (
                      <Link
                        href={`/verein/${slug}/spiel/${r.matchId}`}
                        className="hover:text-accent hover:underline"
                      >
                        {r.heimName} – {r.gastName}
                        {r.ergebnisHeim !== null && (
                          <span className="ml-1.5 font-mono font-semibold text-brand-night-navy">
                            {r.ergebnisHeim}:{r.ergebnisGast}
                          </span>
                        )}
                      </Link>
                    ) : (
                      <span className="text-brand-night-navy/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-brand-night-navy">
                    {r.sponsorDisplayName ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-accent">
                    {eur(r.amountCents)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <ul className="md:hidden space-y-2">
        {filtered.map((r) => {
          const meta = TRIGGER_LABELS[r.triggerType];
          return (
            <li key={`m-${r.chargeId}`} className="rounded-xl border border-brand-neutral/40 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">{meta?.emoji ?? "💚"}</span>
                  <div>
                    <div className="text-sm font-semibold text-brand-night-navy">
                      {meta?.label ?? r.triggerType}
                    </div>
                    {r.sponsorDisplayName && (
                      <div className="text-xs text-brand-night-navy/50">{r.sponsorDisplayName}</div>
                    )}
                  </div>
                </div>
                <span className="font-mono tabular-nums font-black text-accent">
                  {eur(r.amountCents)}
                </span>
              </div>
              {r.matchId && (
                <Link
                  href={`/verein/${slug}/spiel/${r.matchId}`}
                  className="mt-2 block text-xs text-brand-night-navy/60 hover:text-accent"
                >
                  {r.matchDatum
                    ? new Date(r.matchDatum).toLocaleDateString("de-DE")
                    : ""}{" "}
                  {r.heimName} – {r.gastName}
                  {r.ergebnisHeim !== null && ` · ${r.ergebnisHeim}:${r.ergebnisGast}`}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
