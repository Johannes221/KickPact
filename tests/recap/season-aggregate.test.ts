import { describe, it, expect } from "vitest";
import { resolveSeasonAggregate } from "@/lib/recap/season-aggregate";
import type { LeagueStandingRow } from "@/lib/crawler/fussballde";

function ownRow(spiele: number, over: Partial<LeagueStandingRow> = {}): LeagueStandingRow {
  return {
    position: 10,
    teamName: "FC Sportfreunde 1910 Dossenheim",
    teamId: "011MIAE8VG000000VTVG0001VTR8C1K7",
    spiele,
    siege: 14,
    unentschieden: 4,
    niederlagen: 16,
    toreFor: 62,
    toreAgainst: 80,
    punkte: 46,
    ...over
  };
}

/** Was wir selbst aus den gescrapten Spielen wissen (Dossenheim, real). */
const AUS_SPIELEN = {
  spiele: 10,
  siege: 4,
  unentschieden: 1,
  niederlagen: 5,
  toreFor: 18,
  toreAgainst: 23
};

describe("resolveSeasonAggregate", () => {
  /**
   * Der Fall, der live falsch war: 10 gescrapte von 34 echten Spielen.
   * Die Tabelle kennt die volle Saison → sie gewinnt.
   */
  it("nimmt die Tabelle, wenn sie mehr Spiele kennt als wir belegen", () => {
    const r = resolveSeasonAggregate(AUS_SPIELEN, {
      ownRow: ownRow(34),
      teamsInLeague: 18
    });
    expect(r.source).toBe("table");
    expect(r.spiele).toBe(34);
    expect(r.siege).toBe(14);
    expect(r.toreFor).toBe(62);
    expect(r.tabellenplatz).toBe(10);
    expect(r.punkte).toBe(46);
  });

  /**
   * Jugend-Ligen laufen in getrennten Vor-/Endrunden-Staffeln: die Tabelle
   * kennt dann nur einen Teil der Saison. Sie zu übernehmen würde belegte
   * Spiele wegwerfen (B-Junioren: 8 in der Tabelle, 22 tatsächlich gespielt).
   */
  it("verwirft eine Tabelle, die weniger Spiele kennt als wir belegen", () => {
    const r = resolveSeasonAggregate(
      { ...AUS_SPIELEN, spiele: 22 },
      { ownRow: ownRow(8), teamsInLeague: 10 }
    );
    expect(r.source).toBe("matches");
    expect(r.spiele).toBe(22);
  });

  /** Der Platz stammt aus derselben Tabelle — verwerfen wir sie, ist er weg. */
  it("gibt keinen Tabellenplatz aus, wenn die Tabelle verworfen wurde", () => {
    const r = resolveSeasonAggregate(
      { ...AUS_SPIELEN, spiele: 22 },
      { ownRow: ownRow(8), teamsInLeague: 10 }
    );
    expect(r.tabellenplatz).toBeNull();
    expect(r.punkte).toBeNull();
  });

  it("nimmt die Tabelle auch bei Gleichstand (identische Basis)", () => {
    const r = resolveSeasonAggregate(AUS_SPIELEN, {
      ownRow: ownRow(10),
      teamsInLeague: 18
    });
    expect(r.source).toBe("table");
  });

  /**
   * Regression: zum Saisonstart veröffentlicht fussball.de die neue Tabelle mit
   * 0 Spielen und ALPHABETISCH sortierten Plätzen (2026-07-17 live gesehen: alle
   * 15 Teams auf Platz 1). Ohne Untergrenze wäre `0 >= 0` erfüllt → das
   * öffentliche Profil hätte „Platz 1." und „Saison-Insights" über 0:0
   * behauptet. Eine Tabelle ohne gespieltes Spiel belegt nichts.
   */
  it("verwirft eine Tabelle ohne gespieltes Spiel (Saisonstart)", () => {
    const leer = { spiele: 0, siege: 0, unentschieden: 0, niederlagen: 0, toreFor: 0, toreAgainst: 0 };
    const r = resolveSeasonAggregate(leer, {
      ownRow: ownRow(0, { position: 1, siege: 0, unentschieden: 0, niederlagen: 0, toreFor: 0, toreAgainst: 0, punkte: 0 }),
      teamsInLeague: 18
    });
    expect(r.source).toBe("matches");
    expect(r.tabellenplatz).toBeNull();
    expect(r.punkte).toBeNull();
  });

  it("fällt ohne Tabelle auf die ausgewerteten Spiele zurück", () => {
    const r = resolveSeasonAggregate(AUS_SPIELEN, null);
    expect(r.source).toBe("matches");
    expect(r.spiele).toBe(10);
    expect(r.tabellenplatz).toBeNull();
  });

  it("fällt bei nicht gefundener eigener Zeile auf die Spiele zurück", () => {
    const r = resolveSeasonAggregate(AUS_SPIELEN, {
      ownRow: null,
      teamsInLeague: 18
    });
    expect(r.source).toBe("matches");
    expect(r.spiele).toBe(10);
  });
});
