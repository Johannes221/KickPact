import { describe, it, expect } from "vitest";
import {
  hasResult,
  canReportMatchEvents,
  isUpcomingMatch,
  type MatchDisplayInput
} from "@/lib/matches/display-state";

const NOW = new Date("2026-07-16T12:00:00Z");
const FUTURE = new Date("2026-07-19T12:00:00Z");
const PAST = new Date("2026-07-12T12:00:00Z");

function match(over: Partial<MatchDisplayInput> = {}): MatchDisplayInput {
  return {
    status: "scheduled",
    datum: FUTURE,
    ergebnisHeim: null,
    ergebnisGast: null,
    ...over
  };
}

describe("hasResult", () => {
  it("ist false, solange kein Endstand vorliegt", () => {
    expect(hasResult(match())).toBe(false);
  });

  it("ist true bei vollständigem Endstand — auch bei 0:0", () => {
    expect(hasResult(match({ ergebnisHeim: 0, ergebnisGast: 0 }))).toBe(true);
    expect(hasResult(match({ ergebnisHeim: 3, ergebnisGast: 1 }))).toBe(true);
  });

  it("ist false bei halbem Ergebnis (kaputte Row)", () => {
    expect(hasResult(match({ ergebnisHeim: 2, ergebnisGast: null }))).toBe(false);
  });
});

describe("canReportMatchEvents — Zukunfts-Sperre", () => {
  it("sperrt ein angesetztes Spiel, dessen Anstoß noch bevorsteht", () => {
    expect(canReportMatchEvents(match({ datum: FUTURE }), NOW)).toBe(false);
  });

  it("erlaubt ein angesetztes Spiel, dessen Anstoß vorbei ist", () => {
    // fussball.de trägt das Ergebnis oft erst Tage später nach — bis dahin
    // bleibt die Row `scheduled`, der Verein soll trotzdem melden können.
    expect(canReportMatchEvents(match({ datum: PAST }), NOW)).toBe(true);
  });

  it("erlaubt ein finished-Spiel unabhängig vom Datum", () => {
    expect(canReportMatchEvents(match({ status: "finished", datum: FUTURE }), NOW)).toBe(
      true
    );
  });

  it("sperrt abgesagte und verlegte Spiele auch mit vergangenem Datum", () => {
    expect(canReportMatchEvents(match({ status: "cancelled", datum: PAST }), NOW)).toBe(
      false
    );
    expect(canReportMatchEvents(match({ status: "postponed", datum: PAST }), NOW)).toBe(
      false
    );
  });
});

describe("isUpcomingMatch", () => {
  it("ist true für ein angesetztes Spiel in der Zukunft", () => {
    expect(isUpcomingMatch(match(), NOW)).toBe(true);
  });

  it("ist false, sobald ein Ergebnis vorliegt", () => {
    expect(
      isUpcomingMatch(match({ ergebnisHeim: 1, ergebnisGast: 0 }), NOW)
    ).toBe(false);
  });

  it("ist false für ein Spiel, dessen Anstoß vorbei ist (Ergebnis fehlt nur noch)", () => {
    expect(isUpcomingMatch(match({ datum: PAST }), NOW)).toBe(false);
  });

  it("ist false für abgesagte/verlegte Spiele", () => {
    expect(isUpcomingMatch(match({ status: "cancelled" }), NOW)).toBe(false);
    expect(isUpcomingMatch(match({ status: "postponed" }), NOW)).toBe(false);
  });

  it("Invariante: ein kommendes Spiel darf NIE Melden-UI zeigen", () => {
    const upcoming = match();
    expect(isUpcomingMatch(upcoming, NOW)).toBe(true);
    expect(canReportMatchEvents(upcoming, NOW)).toBe(false);
  });
});
