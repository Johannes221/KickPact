import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { listClubTeamsWithStatus } from "@/lib/db/queries/club-admin";
import { resetTestDb } from "../setup/db";

async function seedClub(name: string): Promise<string> {
  const id = createId();
  await db.insert(clubs).values({ id, slug: `c-${id.slice(0, 8)}`, name });
  return id;
}

async function seedTeam(clubId: string, name: string): Promise<string> {
  const id = createId();
  await db.insert(teams).values({ id, clubId, name, saison: "2526" });
  return id;
}

/**
 * A5-Konsistenz: Die Vereins-Mannschaftsliste folgt dem effektiven Lizenz-Verein
 * COALESCE(licensedUnderClubId, clubId). Ein per Lizenz-Transfer übernommenes
 * Team muss beim ZAHLENDEN Verein auftauchen und beim Alt-Container verschwinden,
 * sonst listet A ein Team, das es nicht mehr öffnen darf, und B findet seins nie.
 */
describe("listClubTeamsWithStatus follows licensedUnderClubId", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("lists own container teams (no licensedUnder)", async () => {
    const clubA = await seedClub("Verein A");
    const t1 = await seedTeam(clubA, "1. Herren");
    const rows = await listClubTeamsWithStatus(clubA);
    expect(rows.map((r) => r.id)).toEqual([t1]);
  });

  it("licensing club B lists a transferred team; old container A drops it", async () => {
    const clubA = await seedClub("Verein A");
    const clubB = await seedClub("Verein B");
    const transferred = await seedTeam(clubA, "Transfer-Team");
    const ownA = await seedTeam(clubA, "Eigenes A-Team");
    await db
      .update(teams)
      .set({ licensedUnderClubId: clubB })
      .where(eq(teams.id, transferred));

    const rowsA = await listClubTeamsWithStatus(clubA);
    const rowsB = await listClubTeamsWithStatus(clubB);

    expect(rowsA.map((r) => r.id)).toEqual([ownA]);
    expect(rowsB.map((r) => r.id)).toEqual([transferred]);
  });
});
