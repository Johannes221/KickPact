/**
 * W1.2 (Saison-Features 26/27): Das Saison-Wetten-Fenster folgt der TEAM-Saison,
 * nicht dem Kalenderdatum.
 *
 * Hintergrund: Nach dem Sofort-Rollover auf 2627 (Juni 2026) wäre via
 * getActiveSeason(now) noch das tote 25/26-Fenster (matchdayFiveAt 15.9.2025)
 * maßgeblich — Saison-Ziele für 26/27 wären bis zum 1.7. gesperrt. Quelle ist
 * deshalb `getSeasonByCode(team.saison)`; Fallback (Saison-Row fehlt / Team
 * unbekannt) bleibt getActiveSeason(now).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import { getSeasonWindowForTeam } from "@/lib/billing/wager-window-server";
import {
  assertWagerWindowOpen,
  canCreateSeasonWagerPure,
  WagerWindowClosedError
} from "@/lib/billing/wager-window";

/** Stichtag aus dem Plan: Sofort-Rollover-Tag. */
const TODAY = new Date("2026-06-12T12:00:00Z");

const SEASONS_SEED_SQL = readFileSync(
  path.resolve(process.cwd(), "drizzle/migrations/0055_seasons_seed.sql"),
  "utf8"
);

async function seedTeam(saison: string): Promise<string> {
  const [club] = await db
    .insert(clubs)
    .values({
      slug: `c-${createId().slice(0, 8)}`,
      name: "SV Fenstertest",
      fussballdeVereinId: createId()
    })
    .returning({ id: clubs.id });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: club.id,
      name: "1. Herren",
      saison,
      fussballdeTeamId: createId(),
      isActive: true
    })
    .returning({ id: teams.id });
  return team.id;
}

describe("getSeasonWindowForTeam — Fenster folgt der Team-Saison (W1.2)", () => {
  beforeEach(async () => {
    await resetTestDb();
    await db.execute(sql.raw(SEASONS_SEED_SQL));
  });

  it("Team saison=2627 am 12.06.2026 → Fenster der NEUEN Saison, OFFEN", async () => {
    const teamId = await seedTeam("2627");
    const window = await getSeasonWindowForTeam(teamId, TODAY);
    expect(window?.code).toBe("2627");
    expect(window?.matchdayFiveAt.toISOString()).toBe("2026-09-15T23:59:59.000Z");
    expect(canCreateSeasonWagerPure(window, TODAY)).toBe(true);
    expect(() => assertWagerWindowOpen(window, TODAY)).not.toThrow();
  });

  it("Team saison=2526 am 12.06.2026 → totes Vorsaison-Fenster, ZU", async () => {
    const teamId = await seedTeam("2526");
    const window = await getSeasonWindowForTeam(teamId, TODAY);
    expect(window?.code).toBe("2526");
    expect(canCreateSeasonWagerPure(window, TODAY)).toBe(false);
    expect(() => assertWagerWindowOpen(window, TODAY)).toThrow(
      WagerWindowClosedError
    );
  });

  it("Team-Saison ohne seasons-Row → Fallback getActiveSeason(now)", async () => {
    const teamId = await seedTeam("2829"); // Seed kennt nur 2526/2627/2728
    const window = await getSeasonWindowForTeam(teamId, TODAY);
    // Juni 2026 → laufende Saison 25/26 (siehe tests/queries/seasons.test.ts)
    expect(window?.code).toBe("2526");
  });

  it("unbekanntes Team → Fallback getActiveSeason(now)", async () => {
    const window = await getSeasonWindowForTeam("gibt-es-nicht", TODAY);
    expect(window?.code).toBe("2526");
  });
});
