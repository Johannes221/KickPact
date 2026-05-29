import Link from "next/link";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { assertTeamPageAccess } from "@/lib/auth/scope";
import { listMatchesForTeam, getMatchChargesSummaryForTeam } from "@/lib/db/queries/matches";
import { detectTeamSide } from "@/lib/crawler/team-side";

export const metadata = { title: "Spiele · KickPact" };

type ZeitFilter = "alle" | "kommend" | "gespielt";
type OrtFilter = "alle" | "heim" | "auswaerts";
type RundeFilter = "alle" | "hin" | "rueck";
type ResultFilter = "alle" | "win" | "draw" | "loss";

function eur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("de-DE", { weekday: "short", year: "2-digit", month: "2-digit", day: "2-digit" });
}

function getResult(
  m: { ergebnisHeim: number | null; ergebnisGast: number | null },
  isHeim: boolean
): "win" | "loss" | "draw" | "open" {
  if (m.ergebnisHeim == null || m.ergebnisGast == null) return "open";
  const own = isHeim ? m.ergebnisHeim : m.ergebnisGast;
  const opp = isHeim ? m.ergebnisGast : m.ergebnisHeim;
  if (own > opp) return "win";
  if (own < opp) return "loss";
  return "draw";
}

// Saison-Hälfte aus dem Monat ableiten: Jul–Dez = Hinrunde, Jan–Jun = Rückrunde.
function getRunde(d: Date): "hin" | "rueck" {
  return d.getMonth() + 1 >= 7 ? "hin" : "rueck";
}

const ZEIT_LABEL: Record<ZeitFilter, string> = { alle: "Alle", kommend: "Kommend", gespielt: "Gespielt" };
const ORT_LABEL: Record<OrtFilter, string> = { alle: "Alle", heim: "Heim", auswaerts: "Auswärts" };
const RUNDE_LABEL: Record<RundeFilter, string> = { alle: "Alle", hin: "Hinrunde", rueck: "Rückrunde" };
const RESULT_LABEL: Record<ResultFilter, string> = { alle: "Alle", win: "Siege", draw: "Unent.", loss: "Niederl." };

export default async function SpielePage({
  params,
  searchParams
}: {
  params: Promise<{ slug: string; teamId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { slug, teamId } = await params;
  const sp = await searchParams;
  const zeit = (sp.zeit as ZeitFilter) ?? "alle";
  const ort = (sp.ort as OrtFilter) ?? "alle";
  const runde = (sp.runde as RundeFilter) ?? "alle";
  const result = (sp.result as ResultFilter) ?? "alle";

  const { club } = await assertTeamPageAccess(slug, teamId, "viewer");
  const [team] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.clubId, club.id)))
    .limit(1);

  if (!team) return <div className="text-sm text-brand-alert-red">Mannschaft nicht gefunden.</div>;

  // Saison-Umschalter: Geschwister-Team-Rows (gleiche fussballdeTeamId, andere
  // Saison). Werden erst befüllt, wenn der Vorsaison-Crawl läuft (Phase 8/TODO);
  // bis dahin steht hier nur die aktuelle Saison.
  const siblingSeasons = team.fussballdeTeamId
    ? await db
        .select({ id: teams.id, saison: teams.saison })
        .from(teams)
        .where(eq(teams.fussballdeTeamId, team.fussballdeTeamId))
        .orderBy(desc(teams.saison))
    : [{ id: team.id, saison: team.saison }];

  const matches = await listMatchesForTeam(team.id, 300);
  const chargesByMatch = await getMatchChargesSummaryForTeam(team.id);

  const teamNames = [team.name, club.name];
  const enriched = matches.map((m) => {
    const isHeim = m.heimName ? detectTeamSide(teamNames, m.heimName) === "heim" : false;
    const res = getResult(m, isHeim);
    const isScheduled = m.status === "scheduled" || res === "open";
    return {
      ...m,
      isHeim,
      result: res,
      isScheduled,
      runde: getRunde(m.datum),
      chargesSum: chargesByMatch.get(m.id) ?? 0
    };
  });

  const filtered = enriched.filter((m) => {
    if (zeit === "kommend" && !m.isScheduled) return false;
    if (zeit === "gespielt" && m.isScheduled) return false;
    if (ort === "heim" && !m.isHeim) return false;
    if (ort === "auswaerts" && m.isHeim) return false;
    if (runde !== "alle" && m.runde !== runde) return false;
    if (result !== "alle" && (m.isScheduled || m.result !== result)) return false;
    return true;
  });

  const base = `/verein/${slug}/mannschaft/${teamId}/spiele`;
  // Href bauen und dabei die anderen Filter erhalten.
  const buildHref = (overrides: Record<string, string>) => {
    const next = { zeit, ort, runde, result, ...overrides };
    const qs = Object.entries(next)
      .filter(([, v]) => v && v !== "alle")
      .map(([k, v]) => `${k}=${v}`)
      .join("&");
    return qs ? `${base}?${qs}` : base;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display font-black text-2xl md:text-3xl tracking-tight">Spiele</h1>
        <p className="text-sm text-brand-night-navy/60 mt-1">
          Vergangene und kommende Spiele dieser Mannschaft, gefiltert nach Zeit,
          Ort und Saison-Hälfte.
        </p>
      </div>

      {/* Saison-Umschalter (nur wenn mehrere Saisons vorhanden) */}
      {siblingSeasons.length > 1 && (
        <FilterRow label="Saison">
          {siblingSeasons.map((s) => (
            <FilterChip
              key={s.id}
              href={`/verein/${slug}/mannschaft/${s.id}/spiele`}
              active={s.id === team.id}
            >
              {s.saison}
            </FilterChip>
          ))}
        </FilterRow>
      )}

      {/* Filter */}
      <div className="space-y-2">
        <FilterRow label="Zeit">
          {(["alle", "kommend", "gespielt"] as ZeitFilter[]).map((v) => (
            <FilterChip key={v} href={buildHref({ zeit: v })} active={zeit === v}>
              {ZEIT_LABEL[v]}
            </FilterChip>
          ))}
        </FilterRow>
        <FilterRow label="Ort">
          {(["alle", "heim", "auswaerts"] as OrtFilter[]).map((v) => (
            <FilterChip key={v} href={buildHref({ ort: v })} active={ort === v}>
              {ORT_LABEL[v]}
            </FilterChip>
          ))}
        </FilterRow>
        <FilterRow label="Runde">
          {(["alle", "hin", "rueck"] as RundeFilter[]).map((v) => (
            <FilterChip key={v} href={buildHref({ runde: v })} active={runde === v}>
              {RUNDE_LABEL[v]}
            </FilterChip>
          ))}
        </FilterRow>
        <FilterRow label="Ergebnis">
          {(["alle", "win", "draw", "loss"] as ResultFilter[]).map((v) => (
            <FilterChip key={v} href={buildHref({ result: v })} active={result === v}>
              {RESULT_LABEL[v]}
            </FilterChip>
          ))}
        </FilterRow>
      </div>

      <div className="text-xs text-brand-night-navy/50">{filtered.length} Spiele</div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-brand-neutral/30 bg-white p-8 text-center text-sm text-brand-night-navy/60">
          Keine Spiele in diesem Filter.
        </div>
      ) : (
        <div className="rounded-2xl border border-brand-neutral/30 bg-white overflow-hidden">
          <ul className="divide-y divide-brand-neutral/15">
            {filtered.map((m) => {
              const own = m.isHeim ? m.ergebnisHeim : m.ergebnisGast;
              const opp = m.isHeim ? m.ergebnisGast : m.ergebnisHeim;
              const badge = m.isScheduled
                ? { label: "·", cls: "bg-brand-night-navy/10 text-brand-night-navy/60" }
                : m.result === "win"
                  ? { label: "S", cls: "bg-accent/15 text-accent-dark" }
                  : m.result === "loss"
                    ? { label: "N", cls: "bg-brand-alert-red/15 text-brand-alert-red" }
                    : { label: "U", cls: "bg-neutral-200 text-neutral-700" };

              const inner = (
                <>
                  <span
                    className={`shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${badge.cls}`}
                    aria-hidden
                  >
                    {badge.label}
                  </span>
                  <span className="shrink-0 text-xs text-brand-night-navy/50 w-24">
                    {fmtDate(m.datum)}
                  </span>
                  <span className="flex-1 min-w-0 text-sm truncate">
                    <span className={m.isHeim ? "font-semibold" : "text-brand-night-navy/70"}>
                      {m.heimName}
                    </span>
                    <span className="mx-2 text-brand-night-navy/40">vs</span>
                    <span className={!m.isHeim ? "font-semibold" : "text-brand-night-navy/70"}>
                      {m.gastName}
                    </span>
                  </span>
                  {m.isScheduled ? (
                    <span className="shrink-0 text-[0.65rem] font-semibold uppercase tracking-wide text-brand-night-navy/40">
                      Kommend
                    </span>
                  ) : (
                    <>
                      <span className="shrink-0 font-bold tabular-nums">
                        {own ?? "—"}:{opp ?? "—"}
                      </span>
                      {m.chargesSum > 0 && (
                        <span className="hidden sm:inline-block shrink-0 text-xs font-semibold text-accent-dark tabular-nums">
                          {eur(m.chargesSum)}
                        </span>
                      )}
                    </>
                  )}
                </>
              );

              // Geplante Spiele haben keine Detail-Seite (kein Scrape) → kein Link.
              return (
                <li key={m.id}>
                  {m.isScheduled ? (
                    <div className="flex items-center gap-3 md:gap-4 px-4 py-3">{inner}</div>
                  ) : (
                    <Link
                      href={`/verein/${slug}/spiel/${m.id}`}
                      className="flex items-center gap-3 md:gap-4 px-4 py-3 hover:bg-brand-off-white/50 transition-colors"
                    >
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-[0.65rem] uppercase tracking-widest font-semibold text-brand-night-navy/40">
        {label}
      </span>
      <div className="flex gap-1 overflow-x-auto no-scrollbar">{children}</div>
    </div>
  );
}

function FilterChip({
  href,
  active,
  children
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
        active
          ? "bg-brand-night-navy text-white"
          : "bg-brand-off-white text-brand-night-navy/60 hover:text-brand-night-navy"
      }`}
    >
      {children}
    </Link>
  );
}
