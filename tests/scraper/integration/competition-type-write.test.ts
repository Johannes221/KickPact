/**
 * Verdrahtung des Wettbewerbs-Typs beim Schreiben (Review-Befunde 2026-07-17).
 *
 * Das Geld-Gate in evaluate-match/addManualEvent liest `matches.competitionType`
 * — es nützt nur, wenn der Crawler den Wert auch korrekt setzt. Die Gate-Tests
 * allein prüfen das NICHT: sie setzen die Spalte per UPDATE. Bricht die
 * Ableitung aus `listItem.league` (z.B. durch eine fussball.de-Formatänderung,
 * wie am 2026-07-17 real passiert), bliebe die Suite grün und jedes
 * Freundschaftsspiel wäre wieder zahlungspflichtig.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { clubs, teams, matches } from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../../setup/integration-db";
import {
  insertMatchWithEvents,
  updateMatchWithEvents
} from "@/lib/db/queries/crawler";
import type { SpielListItem, SpielDetails } from "@/lib/crawler/fussballde";

function listItem(league: string | null): SpielListItem {
  return {
    spielId: "fs_ct_1",
    slug: "manuell-fc-sv-gegner",
    datum: "10.05.2026",
    heim: "Wettbewerb FC",
    gast: "SV Gegner",
    ergebnis: "",
    vergangen: true,
    status: "finished",
    url: "https://www.fussball.de/spiel/x/-/spiel/fs_ct_1",
    league
  } as SpielListItem;
}

function details(): SpielDetails {
  return {
    spielId: "fs_ct_1",
    heim: "Wettbewerb FC",
    gast: "SV Gegner",
    heimTeamId: null,
    gastTeamId: null,
    ergebnis: { heim: 2, gast: 0 },
    halbzeit: null,
    events: [],
    resultReliable: true
  } as SpielDetails;
}

async function seedTeam(): Promise<string> {
  const db = await getTestDb();
  await db.insert(clubs).values({ id: "c_ct", slug: "ct-fc", name: "Wettbewerb FC" });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: "c_ct",
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: "TEAM_CT",
      fussballdeSlug: "ct-fc-1",
      isActive: true
    })
    .returning();
  return team.id;
}

async function typeOf(matchId: string) {
  const db = await getTestDb();
  const [m] = await db
    .select({ t: matches.competitionType })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);
  return m.t;
}

describe.skipIf(isIntegrationDbDisabled)("competitionType beim Schreiben", () => {
  beforeEach(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it.each([
    ["Kreisfreundschaftsspiele FS", "friendly"],
    ["Vereinsturnier TU", "friendly"],
    ["Landesliga ME", "league"],
    ["Verbandspokal PO", "cup"]
  ])("insert: %s → %s", async (league, erwartet) => {
    const teamId = await seedTeam();
    const { matchId } = await insertMatchWithEvents({
      teamId,
      listItem: listItem(league),
      details: details()
    });
    expect(await typeOf(matchId)).toBe(erwartet);
  });

  it("insert: ohne Liga-Angabe ehrlich unknown (zahlt weiter)", async () => {
    const teamId = await seedTeam();
    const { matchId } = await insertMatchWithEvents({
      teamId,
      listItem: listItem(null),
      details: details()
    });
    expect(await typeOf(matchId)).toBe("unknown");
  });

  /**
   * Kern der Regression: `updateMatchWithEvents` schrieb den Typ bedingungslos.
   * Liefert ein späterer Crawl keine Liga mehr (am 2026-07-17 real: eine
   * Formatänderung ließ die Extraktion für ALLE Zeilen null liefern), hätte das
   * ein erkanntes Freundschaftsspiel auf `unknown` zurückgestuft — und damit
   * still wieder zahlungspflichtig gemacht. Wissen darf nie verloren gehen.
   */
  it("update: stuft ein erkanntes friendly NICHT auf unknown zurück", async () => {
    const teamId = await seedTeam();
    const { matchId } = await insertMatchWithEvents({
      teamId,
      listItem: listItem("Kreisfreundschaftsspiele FS"),
      details: details()
    });
    expect(await typeOf(matchId)).toBe("friendly");

    await updateMatchWithEvents({
      matchId,
      teamId,
      listItem: listItem(null), // Extraktion kaputt/leer
      details: details(),
      contentHash: "h2"
    });
    expect(await typeOf(matchId)).toBe("friendly");
  });

  it("update: trägt neu erkannten Wettbewerb nach", async () => {
    const teamId = await seedTeam();
    const { matchId } = await insertMatchWithEvents({
      teamId,
      listItem: listItem(null),
      details: details()
    });
    expect(await typeOf(matchId)).toBe("unknown");

    await updateMatchWithEvents({
      matchId,
      teamId,
      listItem: listItem("Kreisfreundschaftsspiele FS"),
      details: details(),
      contentHash: "h2"
    });
    expect(await typeOf(matchId)).toBe("friendly");
  });
});
