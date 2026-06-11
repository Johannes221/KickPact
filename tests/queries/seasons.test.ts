import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { resetTestDb } from "../setup/db";
import {
  getActiveSeasonForDate,
  getSeasonByCode
} from "@/lib/db/queries/seasons";

/**
 * Phase 3 / R4 — Migration 0055 (seasons-Seed) + getActiveSeasonForDate.
 *
 * Die Migration läuft auf frischen DBs implizit über den Test-Migrator
 * (getTestDb). Hier führen wir das Migrations-SQL zusätzlich DIREKT aus —
 * das beweist (a) das SQL ist valide, (b) ON CONFLICT macht es idempotent,
 * und seedet zugleich die Rows für den Query-Test.
 */

const MIGRATION_SQL = readFileSync(
  path.resolve(process.cwd(), "drizzle/migrations/0055_seasons_seed.sql"),
  "utf8"
);

async function applySeasonsSeedMigration() {
  await db.execute(sql.raw(MIGRATION_SQL));
}

describe("Migration 0055 — seasons-Seed", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("legt 2526/2627/2728 an und ist idempotent (ON CONFLICT DO NOTHING)", async () => {
    await applySeasonsSeedMigration();
    await applySeasonsSeedMigration(); // zweiter Lauf darf nicht knallen

    const s2526 = await getSeasonByCode("2526");
    const s2627 = await getSeasonByCode("2627");
    const s2728 = await getSeasonByCode("2728");
    expect(s2526).not.toBeNull();
    expect(s2627).not.toBeNull();
    expect(s2728).not.toBeNull();

    // Werte 2627 exakt aus lib/db/seeds/seasons.ts
    expect(s2627!.startsAt.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(s2627!.endsAt.toISOString()).toBe("2027-05-31T23:59:59.000Z");
    expect(s2627!.matchdayFiveAt.toISOString()).toBe("2026-09-15T23:59:59.000Z");

    // 2526: laufende Saison (Spec R4)
    expect(s2526!.startsAt.toISOString()).toBe("2025-08-01T00:00:00.000Z");
    expect(s2526!.endsAt.toISOString()).toBe("2026-06-30T23:59:59.000Z");
  });

  it("getActiveSeasonForDate liefert mit gemockter Zeit die richtige Row", async () => {
    await applySeasonsSeedMigration();

    // Mitten in Saison 25/26
    const inSeason = await getActiveSeasonForDate(new Date("2026-03-15T12:00:00Z"));
    expect(inSeason?.code).toBe("2526");

    // Mitten in Saison 26/27
    const nextSeason = await getActiveSeasonForDate(new Date("2026-10-15T12:00:00Z"));
    expect(nextSeason?.code).toBe("2627");

    // Frühbucher-Fenster Juli 2026: 2526 ist gerade vorbei (endsAt+30d-Nachlauf)
    const summer = await getActiveSeasonForDate(new Date("2026-07-05T12:00:00Z"));
    expect(summer?.code).toBe("2526");
  });
});
