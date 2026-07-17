import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { InsightsStrip } from "@/app/m/[slug]/_components/insights-strip";
import type { PublicTeamInsights } from "@/lib/db/queries/team-public-insights";

/**
 * Der Insights-Streifen ist eine SPONSOREN-Fläche (/m/[slug]).
 *
 * Live gesehen 2026-07-17: zum Saisonstart (26/27 beginnt am 19.07.) hat noch
 * keine Mannschaft ein Pflichtspiel gemacht → der Streifen zeigte
 * „0 ausgewertete Spiele · 0/0/0 · 0:0 · 0". Ehrlich, aber jede Mannschaft sah
 * damit für Sponsoren nach „nichts los" aus. Das Team-Dashboard blendet seine
 * Kacheln bei 0 Spielen aus — hier fehlte diese Regel.
 *
 * Es geht nichts verloren: die Vorsaison hat auf derselben Seite einen eigenen
 * „Letzte Saison"-Block.
 */
function insights(over: Partial<PublicTeamInsights["current"]> = {}): PublicTeamInsights {
  return {
    current: {
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      position: null,
      teamsInLeague: null,
      source: "matches",
      ...over
    },
    lastSeason: null
  };
}

describe("InsightsStrip", () => {
  it("rendert nichts, solange kein Spiel ausgewertet ist", () => {
    expect(renderToString(<InsightsStrip insights={insights()} />)).toBe("");
  });

  it("rendert auch dann nichts, wenn nur ein Vorjahres-Platz bekannt ist", () => {
    // Der Vorjahres-Platz allein trägt keinen Streifen aus Null-Kacheln — die
    // Vorsaison steht ohnehin im eigenen Block darunter.
    const withLast: PublicTeamInsights = {
      ...insights(),
      lastSeason: {
        saison: "2526",
        finalPosition: 3,
        teamsInLeague: 14,
        promoted: false,
        relegated: false
      }
    };
    expect(renderToString(<InsightsStrip insights={withLast} />)).toBe("");
  });

  it("zeigt die Kacheln, sobald ein Spiel ausgewertet ist", () => {
    const html = renderToString(
      <InsightsStrip insights={insights({ games: 1, wins: 1, goalsFor: 2 })} />
    );
    expect(html).toContain("Bilanz");
    expect(html).toContain("ausgewertetes Spiel");
  });

  it("nennt sich Saison-Insights, sobald die Liga-Tabelle die Quelle ist", () => {
    const html = renderToString(
      <InsightsStrip
        insights={insights({ games: 34, wins: 14, source: "table", position: 10, teamsInLeague: 18 })}
      />
    );
    expect(html).toContain("Saison-Insights");
    expect(html).toContain("Platz");
  });
});
