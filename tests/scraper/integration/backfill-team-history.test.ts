/**
 * Integration-Test: Vorsaison-Backfill (backfill-team-history) gegen die
 * Test-DB.
 *
 * Der Crawler (lib/crawler/vorsaison) ist gemockt und liefert das gecapturte
 * Vorsaison-Fixture-JSON (dossenheim/herren1, Saison 2425). Verifiziert:
 *
 *   1. Alle Fixture-Spiele landen als `finished`-Rows MIT Ergebnis, OHNE
 *      Events und OHNE contentHash in `matches`.
 *   2. Idempotenz: zweiter Lauf legt keine Duplikate an (ON CONFLICT).
 *   3. Es werden KEINE Inngest-Events gesendet (kein match/finished →
 *      keine Charges, keine Pushes).
 *   4. Bereits existierende Rows (regulärer Crawl-Pfad) bleiben unangetastet.
 *   5. Inaktive/unbekannte Teams werden sauber übersprungen.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { matches, matchEvents, teams } from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../../setup/integration-db";
import { seedClubFromFixture } from "../../fixtures/scraper/seed-from-fixtures";
import { JSON_ROOT } from "../../fixtures/scraper/config";
import { inngest } from "@/lib/inngest/client";
import {
  runBackfillForTeam,
  prevSaisonCodeLocal
} from "@/lib/inngest/functions/backfill-team-history";
import type { VorsaisonSpiel } from "@/lib/crawler/vorsaison";

// Crawler mocken: liefert das Capture-Fixture der angefragten Saison.
// (Memory-Falle: der echte Crawler fetcht via undici — niemals live in Tests.)
vi.mock("@/lib/crawler/vorsaison", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crawler/vorsaison")>();
  const fsm = await import("node:fs/promises");
  const pathm = await import("node:path");
  return {
    ...actual,
    getVorsaisonSpiele: vi.fn(async (_teamId: string, saison: string) => {
      const file = pathm.join(
        "tests/fixtures/scraper/json/dossenheim",
        `herren1-vorsaison-saison${saison}.json`
      );
      const fixture = JSON.parse(await fsm.readFile(file, "utf-8")) as {
        spiele: VorsaisonSpiel[];
      };
      return fixture.spiele;
    })
  };
});

async function loadFixtureSpiele(saison: string): Promise<VorsaisonSpiel[]> {
  const file = path.join(
    JSON_ROOT,
    "dossenheim",
    `herren1-vorsaison-saison${saison}.json`
  );
  return (JSON.parse(await fs.readFile(file, "utf-8")) as {
    spiele: VorsaisonSpiel[];
  }).spiele;
}

describe("prevSaisonCodeLocal", () => {
  it("2627 → 2526 (Plan-Beispiel)", () => {
    expect(prevSaisonCodeLocal("2627")).toBe("2526");
  });
  it("2526 → 2425", () => {
    expect(prevSaisonCodeLocal("2526")).toBe("2425");
  });
  it("Jahrhundert-Padding: 1011 → 0910", () => {
    expect(prevSaisonCodeLocal("1011")).toBe("0910");
  });
  it("null bei ungültigem Code", () => {
    expect(prevSaisonCodeLocal("25/26")).toBeNull();
    expect(prevSaisonCodeLocal("")).toBeNull();
  });
});

describe.skipIf(isIntegrationDbDisabled)("backfill-team-history integration", () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("inserted alle Vorsaison-Spiele als finished MIT Ergebnis, OHNE Events, OHNE inngest.send", async () => {
    const sendSpy = vi.spyOn(inngest, "send");
    const { teamIds } = await seedClubFromFixture("dossenheim");
    const teamId = teamIds.herren1!;
    const fixture = await loadFixtureSpiele("2425"); // Teams sind saison=2526 geseedet

    const result = await runBackfillForTeam(teamId);

    expect(result.prevSaison).toBe("2425");
    expect(result.found).toBe(fixture.length);
    expect(result.inserted).toBe(fixture.length);
    expect(result.skippedExisting).toBe(0);

    const db = await getTestDb();
    const rows = await db.select().from(matches).where(eq(matches.teamId, teamId));
    expect(rows.length).toBe(fixture.length);
    for (const row of rows) {
      expect(row.status).toBe("finished");
      expect(row.ergebnisHeim).not.toBeNull();
      expect(row.ergebnisGast).not.toBeNull();
      expect(row.contentHash).toBeNull(); // kein Detail-Scrape gelaufen
    }
    const events = await db.select().from(matchEvents);
    expect(events.length).toBe(0);

    // KEINE Events emittiert — weder match/finished noch sonst etwas.
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("ist idempotent: zweiter Lauf legt keine Duplikate an", async () => {
    const { teamIds } = await seedClubFromFixture("dossenheim");
    const teamId = teamIds.herren1!;

    const first = await runBackfillForTeam(teamId);
    const second = await runBackfillForTeam(teamId);

    expect(second.inserted).toBe(0);
    expect(second.skippedExisting).toBe(first.found);

    const db = await getTestDb();
    const rows = await db.select().from(matches).where(eq(matches.teamId, teamId));
    expect(rows.length).toBe(first.inserted);
  });

  it("fasst bereits existierende Rows (regulärer Crawl-Pfad) nicht an", async () => {
    const { teamIds } = await seedClubFromFixture("dossenheim");
    const teamId = teamIds.herren1!;
    const fixture = await loadFixtureSpiele("2425");
    const existing = fixture[0];

    // Reguläre Crawl-Row mit ABWEICHENDEM Ergebnis + contentHash simulieren.
    const db = await getTestDb();
    await db.insert(matches).values({
      teamId,
      fussballdeSpielId: existing.spielId,
      datum: new Date("2024-09-01T12:00:00Z"),
      heimName: "Anderer Stand",
      gastName: "Aus Regulärem Crawl",
      ergebnisHeim: 9,
      ergebnisGast: 9,
      status: "finished",
      contentHash: "echter-crawl-hash"
    });

    const result = await runBackfillForTeam(teamId);
    expect(result.inserted).toBe(fixture.length - 1);
    expect(result.skippedExisting).toBe(1);

    const [row] = await db
      .select()
      .from(matches)
      .where(eq(matches.fussballdeSpielId, existing.spielId));
    expect(row.heimName).toBe("Anderer Stand");
    expect(row.ergebnisHeim).toBe(9);
    expect(row.contentHash).toBe("echter-crawl-hash");
  });

  it("überspringt unbekannte/inaktive Teams ohne Crawl", async () => {
    const { getVorsaisonSpiele } = await import("@/lib/crawler/vorsaison");

    const unknown = await runBackfillForTeam("gibt-es-nicht");
    expect(unknown.skippedReason).toBe("team-not-active");

    const { teamIds } = await seedClubFromFixture("dossenheim");
    const teamId = teamIds.herren1!;
    const db = await getTestDb();
    await db.update(teams).set({ isActive: false }).where(eq(teams.id, teamId));

    const inactive = await runBackfillForTeam(teamId);
    expect(inactive.skippedReason).toBe("team-not-active");
    expect(getVorsaisonSpiele).not.toHaveBeenCalled();
  });
});
