import type { PublicTeamInsights } from "@/lib/db/queries/team-public-insights";

/**
 * Kompakter Insights-Streifen mit Saison-Kennzahlen (Platz Vorjahr, Bilanz,
 * Tore, Spiele) sowie optionalem Auf-/Abstiegs-Hinweis der letzten Saison.
 */
export function InsightsStrip({ insights }: { insights: PublicTeamInsights }) {
  const c = insights.current;
  const tiles = [
    {
      n: insights.lastSeason?.finalPosition
        ? `${insights.lastSeason.finalPosition}.`
        : "–",
      l: "Platz (Vorj.)"
    },
    { n: `${c.wins}/${c.draws}/${c.losses}`, l: "Bilanz" },
    { n: `${c.goalsFor}:${c.goalsAgainst}`, l: "Tore" },
    { n: String(c.games), l: "Spiele" }
  ];
  return (
    <section className="px-4 pt-4">
      <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-accent">
        Saison-Insights
      </div>
      <div className="grid grid-cols-4 gap-2">
        {tiles.map((t) => (
          <div
            key={t.l}
            className="rounded-xl bg-brand-night-navy/[0.04] p-2.5 text-center"
          >
            <div className="text-lg font-extrabold leading-none text-brand-night-navy">
              {t.n}
            </div>
            <div className="mt-1 text-[8.5px] uppercase tracking-wide text-brand-night-navy/60">
              {t.l}
            </div>
          </div>
        ))}
      </div>
      {insights.lastSeason &&
        (insights.lastSeason.promoted || insights.lastSeason.relegated) && (
          <div className="mt-2 rounded-lg bg-brand-night-navy/[0.04] px-3 py-2 text-xs text-brand-night-navy/80">
            Letzte Saison:{" "}
            {insights.lastSeason.promoted ? "Aufstieg ↑" : "Abstieg ↓"}
          </div>
        )}
    </section>
  );
}
