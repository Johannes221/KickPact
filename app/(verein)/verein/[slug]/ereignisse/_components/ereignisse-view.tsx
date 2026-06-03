"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { EreignisRow } from "@/lib/db/queries/club-dashboard";
import { TriggerIcon } from "@/components/shared/trigger-icon";
import { abbreviateTeamName } from "@/lib/utils/team-name";

const TRIGGER_LABELS: Record<string, { label: string; emoji: string }> = {
  goal_total:           { label: "Pro Tor",          emoji: "⚽" },
  goal_by_player:       { label: "Spieler-Tor",       emoji: "💎" },
  win:                  { label: "Pro Sieg",           emoji: "🏆" },
  clean_sheet:          { label: "Zu-Null-Sieg",       emoji: "🛡️" },
  comeback_win:         { label: "Comeback-Sieg",      emoji: "🔥" },
  hattrick:             { label: "Hattrick",           emoji: "🎯" },
  special_goal:         { label: "Spezial-Tor",        emoji: "🎭" },
  goals_scored_min:     { label: "Viele Tore",         emoji: "🎉" },
  goal_diff_min:        { label: "Hoher Sieg",         emoji: "💪" },
  season_promotion:     { label: "Aufstieg",           emoji: "⬆️" },
  season_no_relegation: { label: "Klassenerhalt",      emoji: "🛟" },
  season_champion:      { label: "Meister",            emoji: "👑" },
  season_table_position:{ label: "Tabellenplatz",      emoji: "🥇" },
  season_cup_round:     { label: "Pokal-Runde",        emoji: "🏆" },
  season_custom:        { label: "Saison-Ziel",        emoji: "🎺" },
};

/** Spieler-/Ereignis-Label mit optionalem Spielernamen */
function triggerLabel(r: EreignisRow): string {
  const base = TRIGGER_LABELS[r.triggerType]?.label ?? r.triggerType;
  if (r.playerName) return `${base} · ${r.playerName}`;
  return base;
}

function eur(cents: number) {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

type SortKey = "date" | "amount" | "type";
type SortDir = "asc" | "desc";

export function EreignisseView({ rows, slug }: { rows: EreignisRow[]; slug: string }) {
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

  // Team-only filter (used for summary cards so they react to team but not type)
  const teamFiltered = useMemo(
    () => (filterTeam === "all" ? rows : rows.filter((r) => r.teamId === filterTeam)),
    [rows, filterTeam]
  );

  // Full filter + sort (used for the list)
  const filtered = useMemo(() => {
    let result = teamFiltered;
    if (filterType !== "all") result = result.filter((r) => r.triggerType === filterType);
    return [...result].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "date")   cmp = (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
      if (sortKey === "amount") cmp = a.amountCents - b.amountCents;
      if (sortKey === "type")   cmp = (a.triggerType ?? "").localeCompare(b.triggerType ?? "");
      return sortDir === "desc" ? -cmp : cmp;
    });
  }, [teamFiltered, filterType, sortKey, sortDir]);

  // Summary cards — based on teamFiltered so they reflect the team selection
  const byType = useMemo(() => {
    const map = new Map<string, { count: number; cents: number; sponsors: Set<string> }>();
    for (const r of teamFiltered) {
      const e = map.get(r.triggerType) ?? { count: 0, cents: 0, sponsors: new Set<string>() };
      e.count++;
      e.cents += r.amountCents;
      if (r.sponsorDisplayName) e.sponsors.add(r.sponsorDisplayName);
      map.set(r.triggerType, e);
    }
    return [...map.entries()]
      .sort((a, b) => b[1].cents - a[1].cents)
      .slice(0, 4);
  }, [teamFiltered]);

  const totalCents = filtered.reduce((s, r) => s + r.amountCents, 0);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  }
  function sortArrow(k: SortKey) {
    return sortKey === k ? (sortDir === "desc" ? " ↓" : " ↑") : "";
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-6 text-sm text-brand-night-navy/60">
        Noch keine Ereignisse. Sobald Sponsoren aktiv sind und Spiele stattfinden, erscheinen hier alle ausgelösten Ereignisse.
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Top-4 Ereignistypen nach Gesamtbetrag — aktualisieren sich mit Team-Filter */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
        {byType.map(([type, { count, cents, sponsors }]) => {
          const meta = TRIGGER_LABELS[type];
          const active = filterType === type;
          return (
            <button
              key={type}
              onClick={() => setFilterType(active ? "all" : type)}
              className={
                "text-left rounded-xl border p-3 transition-colors " +
                (active
                  ? "border-accent bg-accent/5"
                  : "border-brand-neutral/40 bg-white hover:border-accent/40")
              }
            >
              <TriggerIcon type={type} className="h-5 w-5 text-accent-dark" />
              <div className="mt-1 font-semibold text-xs text-brand-night-navy">{meta?.label ?? type}</div>
              <div className="mt-0.5 font-mono tabular-nums font-bold text-sm text-accent">{eur(cents)}</div>
              <div className="flex items-center gap-1.5 text-[0.65rem] text-brand-night-navy/50 mt-0.5">
                <span>{count}×</span>
                {sponsors.size > 0 && (
                  <>
                    <span className="opacity-40">·</span>
                    <span>{sponsors.size} {sponsors.size === 1 ? "Sponsor" : "Sponsoren"}</span>
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filter + Sort Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <select
          className="rounded-lg bg-white shadow-ios-card px-3 py-1.5 text-sm text-brand-night-navy"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="all">Alle Ereignisse</option>
          {triggerTypes.map((t) => (
            <option key={t} value={t}>
              {TRIGGER_LABELS[t]?.label ?? t}
            </option>
          ))}
        </select>
        {teams.length > 1 && (
          <select
            className="rounded-lg bg-white shadow-ios-card px-3 py-1.5 text-sm text-brand-night-navy"
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
          >
            <option value="all">Alle Mannschaften</option>
            {teams.map(([id, name]) => (
              <option key={id ?? ""} value={id ?? ""}>{name}</option>
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
              {k === "date" ? "Datum" : k === "amount" ? "Betrag" : "Typ"}{sortArrow(k)}
            </button>
          ))}
        </div>
        <div className="text-xs text-brand-night-navy/50 ml-1">
          {filtered.length} Ereignisse · <strong>{eur(totalCents)}</strong>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto rounded-2xl bg-white shadow-ios-card">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-brand-off-white text-xs uppercase tracking-wider text-brand-night-navy/60">
            <tr>
              <th className="px-4 py-3 text-left font-semibold cursor-pointer hover:text-brand-night-navy"
                  onClick={() => toggleSort("date")}>
                Datum{sortArrow("date")}
              </th>
              <th className="px-4 py-3 text-left font-semibold cursor-pointer hover:text-brand-night-navy"
                  onClick={() => toggleSort("type")}>
                Ereignis{sortArrow("type")}
              </th>
              <th className="px-4 py-3 text-left font-semibold">Spiel</th>
              <th className="px-4 py-3 text-left font-semibold">Sponsor</th>
              <th className="px-4 py-3 text-right font-semibold cursor-pointer hover:text-brand-night-navy"
                  onClick={() => toggleSort("amount")}>
                Betrag{sortArrow("amount")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-neutral/30">
            {filtered.map((r) => {
              const meta = TRIGGER_LABELS[r.triggerType];
              const matchHref = r.matchId ? `/verein/${slug}/spiel/${r.matchId}` : null;
              return (
                <tr key={r.chargeId}
                    className={matchHref ? "hover:bg-brand-off-white/60 cursor-pointer" : ""}>
                  <td className="px-4 py-3 font-mono tabular-nums text-brand-night-navy/70 text-xs">
                    {matchHref ? (
                      <Link href={matchHref} className="block">
                        {r.matchDatum
                          ? new Date(r.matchDatum).toLocaleDateString("de-DE")
                          : new Date(r.createdAt).toLocaleDateString("de-DE")}
                      </Link>
                    ) : (
                      r.matchDatum
                        ? new Date(r.matchDatum).toLocaleDateString("de-DE")
                        : new Date(r.createdAt).toLocaleDateString("de-DE")
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {matchHref ? (
                      <Link href={matchHref} className="block">
                        <span className="inline-flex items-center gap-1.5 font-semibold text-brand-night-navy">
                          <TriggerIcon type={r.triggerType} className="h-4 w-4 text-brand-night-navy/60" />
                          <span>{meta?.label ?? r.triggerType}</span>
                        </span>
                        {r.playerName && (
                          <div className="text-xs text-brand-night-navy/50 mt-0.5">{r.playerName}</div>
                        )}
                        {r.teamName && (
                          <div className="text-xs text-brand-night-navy/40 mt-0.5">{r.teamName}</div>
                        )}
                      </Link>
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1.5 font-semibold text-brand-night-navy">
                          <TriggerIcon type={r.triggerType} className="h-4 w-4 text-brand-night-navy/60" />
                          <span>{meta?.label ?? r.triggerType}</span>
                        </span>
                        {r.playerName && (
                          <div className="text-xs text-brand-night-navy/50 mt-0.5">{r.playerName}</div>
                        )}
                        {r.teamName && (
                          <div className="text-xs text-brand-night-navy/40 mt-0.5">{r.teamName}</div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3 text-brand-night-navy/70">
                    {matchHref ? (
                      <Link
                        href={matchHref}
                        className="hover:text-accent hover:underline"
                        title={r.heimName ? `${r.heimName} – ${r.gastName}` : undefined}
                      >
                        {abbreviateTeamName(r.heimName ?? "")} – {abbreviateTeamName(r.gastName ?? "")}
                        {r.ergebnisHeim !== null && (
                          <span className="ml-1.5 font-mono font-semibold text-brand-night-navy tabular-nums">
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
                    {matchHref ? (
                      <Link href={matchHref} className="block">{eur(r.amountCents)}</Link>
                    ) : (
                      eur(r.amountCents)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards — ganzes Card klickbar */}
      <ul className="md:hidden space-y-2">
        {filtered.map((r) => {
          const meta = TRIGGER_LABELS[r.triggerType];
          const matchHref = r.matchId ? `/verein/${slug}/spiel/${r.matchId}` : null;
          const card = (
            <div className="rounded-xl bg-white shadow-ios-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <TriggerIcon type={r.triggerType} className="mt-0.5 h-5 w-5 shrink-0 text-accent-dark" />
                  <div>
                    <div className="text-sm font-semibold text-brand-night-navy">
                      {triggerLabel(r)}
                    </div>
                    {r.sponsorDisplayName && (
                      <div className="text-xs text-brand-night-navy/50">{r.sponsorDisplayName}</div>
                    )}
                  </div>
                </div>
                <span className="font-mono tabular-nums font-bold text-accent shrink-0">
                  {eur(r.amountCents)}
                </span>
              </div>
              {(r.matchId || r.matchDatum) && (
                <div className="mt-2 text-xs text-brand-night-navy/50">
                  {r.matchDatum
                    ? new Date(r.matchDatum).toLocaleDateString("de-DE")
                    : new Date(r.createdAt).toLocaleDateString("de-DE")}
                  {r.heimName &&
                    ` · ${abbreviateTeamName(r.heimName)} – ${abbreviateTeamName(r.gastName ?? "")}`}
                  {r.ergebnisHeim !== null && ` · ${r.ergebnisHeim}:${r.ergebnisGast}`}
                </div>
              )}
              {matchHref && (
                <div className="mt-1.5 text-xs text-accent font-medium">Zum Spiel →</div>
              )}
            </div>
          );

          return (
            <li key={`m-${r.chargeId}`}>
              {matchHref ? (
                <Link href={matchHref} className="block">{card}</Link>
              ) : (
                card
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
