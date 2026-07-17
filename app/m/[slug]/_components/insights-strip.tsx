import type { PublicTeamInsights } from "@/lib/db/queries/team-public-insights";
import { statsHeading } from "@/lib/recap/aggregate-scope";

/**
 * Kompakter Insights-Streifen mit Saison-Kennzahlen (Platz, Bilanz, Tore,
 * Spiele) sowie optionalem Auf-/Abstiegs-Hinweis der letzten Saison.
 *
 * Die Überschrift folgt der Quelle der Zahlen: nur mit Liga-Tabelle im Rücken
 * decken sie die Saison ab — sonst nennt sie die Zahl der ausgewerteten Spiele,
 * statt eine Saison zu behaupten (siehe lib/recap/aggregate-scope.ts).
 */
export function InsightsStrip({ insights }: { insights: PublicTeamInsights }) {
  const c = insights.current;
  // Kein ausgewertetes Spiel → gar nichts zeigen, statt einen Streifen aus
  // Nullen. Zum Saisonstart (und für frisch onboardete Mannschaften) stand hier
  // sonst „0 ausgewertete Spiele · 0/0/0 · 0:0" — auf einer Sponsoren-Fläche
  // sieht das nach „nichts los" aus, obwohl die Saison schlicht noch nicht
  // begonnen hat. Das Team-Dashboard blendet seine Kacheln bei 0 Spielen
  // genauso aus. Die Vorsaison geht nicht verloren: sie hat auf derselben Seite
  // ihren eigenen „Letzte Saison"-Block.
  if (c.games === 0) return null;
  // Der aktuelle Tabellenplatz ist aussagekräftiger als der des Vorjahrs —
  // aber nur, wenn die Tabelle die Quelle ist. Sonst der Vorjahres-Platz.
  const platz =
    c.position !== null
      ? { n: `${c.position}.`, l: "Platz" }
      : {
          n: insights.lastSeason?.finalPosition
            ? `${insights.lastSeason.finalPosition}.`
            : "–",
          l: "Platz (Vorj.)"
        };
  const tiles = [
    platz,
    { n: `${c.wins}/${c.draws}/${c.losses}`, l: "Bilanz" },
    { n: `${c.goalsFor}:${c.goalsAgainst}`, l: "Tore" },
    { n: String(c.games), l: "Spiele" }
  ];
  return (
    <section className="px-4 pt-4">
      <div className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-accent">
        {statsHeading(c.source, c.games)}
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
