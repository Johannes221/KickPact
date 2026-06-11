/**
 * Review K2 (2026-06-11): Saison-Ergebnis-Formular muss nach dem
 * Saison-Bump (15.7.) die VORSAISON bedienen, solange deren Ergebnis fehlt —
 * sonst landet der Juli-Eintrag auf der neuen Saison und evaluate-season
 * findet die alten Saison-Pacts nie (0 Charges, still).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams, seasonResults } from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import { resolveSeasonResultTarget } from "@/lib/db/queries/team-lifecycle";

async function seedTeam(saison: string): Promise<string> {
  const clubId = createId();
  await db.insert(clubs).values({ id: clubId, slug: `c-${clubId.slice(0, 8)}`, name: "K2 FC" });
  const [t] = await db
    .insert(teams)
    .values({
      clubId,
      name: "1. Herren",
      saison,
      fussballdeTeamId: `T_${clubId.slice(0, 8)}`,
      isActive: true
    })
    .returning({ id: teams.id });
  return t.id;
}

describe("resolveSeasonResultTarget", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("Post-Bump im Juli ohne Vorsaison-Ergebnis → bedient die Vorsaison", async () => {
    const teamId = await seedTeam("2627");
    const target = await resolveSeasonResultTarget(
      teamId,
      "2627",
      new Date("2026-07-20T12:00:00Z")
    );
    expect(target.saison).toBe("2526");
    expect(target.result).toBeNull();
  });

  it("Post-Bump, Vorsaison-Ergebnis existiert schon → aktuelle Saison", async () => {
    const teamId = await seedTeam("2627");
    await db.insert(seasonResults).values({
      teamId,
      saison: "2526",
      finalPosition: 3
    });
    const target = await resolveSeasonResultTarget(
      teamId,
      "2627",
      new Date("2026-07-20T12:00:00Z")
    );
    expect(target.saison).toBe("2627");
  });

  it("Pre-Bump im Juni → aktuelle Saison (Grace-Fenster noch nicht offen)", async () => {
    const teamId = await seedTeam("2526");
    const target = await resolveSeasonResultTarget(
      teamId,
      "2526",
      new Date("2026-06-15T12:00:00Z")
    );
    expect(target.saison).toBe("2526");
  });

  it("Nach dem 1.10. → aktuelle Saison (Grace vorbei)", async () => {
    const teamId = await seedTeam("2627");
    const target = await resolveSeasonResultTarget(
      teamId,
      "2627",
      new Date("2026-10-05T12:00:00Z")
    );
    expect(target.saison).toBe("2627");
  });

  it("existierendes aktuelles Ergebnis gewinnt immer", async () => {
    const teamId = await seedTeam("2627");
    await db.insert(seasonResults).values({
      teamId,
      saison: "2627",
      finalPosition: 1
    });
    const target = await resolveSeasonResultTarget(
      teamId,
      "2627",
      new Date("2026-07-20T12:00:00Z")
    );
    expect(target.saison).toBe("2627");
    expect(target.result?.finalPosition).toBe(1);
  });
});
