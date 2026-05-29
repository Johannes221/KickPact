import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams, subscriptions } from "@/lib/db/schema";
import {
  updateClubMasterData,
  manualVerifyClub,
  manualVerifyTeam,
  resumeSubscription,
  updateTeam
} from "@/lib/db/queries/club-admin";
import { resetTestDb } from "../setup/db";
import { isIntegrationDbDisabled } from "../setup/integration-db";

async function makeClub(): Promise<string> {
  const id = createId();
  await db.insert(clubs).values({ id, slug: `c-${id.slice(0, 6)}`, name: "Alt", logoUrl: null });
  return id;
}
async function makeTeam(clubId: string): Promise<string> {
  const id = createId();
  await db.insert(teams).values({ id, clubId, name: "1. Herren", saison: "2526" });
  return id;
}

describe.skipIf(isIntegrationDbDisabled)("club-admin queries", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("updates master data and nulls empty optionals", async () => {
    const clubId = await makeClub();
    await updateClubMasterData({ clubId, name: "Neuer Name", ort: "Berlin", iban: "", taxId: "DE123" });
    const [row] = await db.select().from(clubs).where(eq(clubs.id, clubId));
    expect(row.name).toBe("Neuer Name");
    expect(row.ort).toBe("Berlin");
    expect(row.iban).toBeNull();
    expect(row.taxId).toBe("DE123");
  });

  it("manualVerifyClub sets verifiedAt once and is idempotent", async () => {
    const clubId = await makeClub();
    const first = await manualVerifyClub(clubId);
    expect(first.newlyVerified).toBe(true);
    const second = await manualVerifyClub(clubId);
    expect(second.newlyVerified).toBe(false);
    const [row] = await db.select().from(clubs).where(eq(clubs.id, clubId));
    expect(row.verifiedAt).not.toBeNull();
  });

  it("manualVerifyTeam sets verifiedAt", async () => {
    const clubId = await makeClub();
    const teamId = await makeTeam(clubId);
    const res = await manualVerifyTeam(teamId);
    expect(res.newlyVerified).toBe(true);
    const [row] = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(row.verifiedAt).not.toBeNull();
  });

  it("updateTeam applies a partial patch", async () => {
    const clubId = await makeClub();
    const teamId = await makeTeam(clubId);
    await updateTeam({ teamId, discoverable: true });
    let [row] = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(row.discoverable).toBe(true);
    expect(row.name).toBe("1. Herren"); // unverändert

    await updateTeam({ teamId, name: "2. Herren", isActive: false });
    [row] = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(row.name).toBe("2. Herren");
    expect(row.isActive).toBe(false);
    expect(row.discoverable).toBe(true); // bleibt
  });

  it("resumeSubscription sets status active and clears pausedUntil", async () => {
    const clubId = await makeClub();
    await db.insert(subscriptions).values({ clubId, status: "paused", pausedUntil: new Date() });
    await resumeSubscription(clubId);
    const [row] = await db.select().from(subscriptions).where(eq(subscriptions.clubId, clubId));
    expect(row.status).toBe("active");
    expect(row.pausedUntil).toBeNull();
  });
});
