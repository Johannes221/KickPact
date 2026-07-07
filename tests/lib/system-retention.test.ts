import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams, sponsorLeads } from "@/lib/db/schema";
import {
  deleteExpiredSystemRows,
  LEADS_RETENTION_DAYS
} from "@/lib/db/queries/system-retention";
import { resetTestDb } from "../setup/db";
import { isIntegrationDbDisabled } from "../setup/integration-db";

async function makeTeam(): Promise<string> {
  const clubId = createId();
  await db.insert(clubs).values({ id: clubId, slug: `c-${clubId.slice(0, 6)}`, name: "Club", logoUrl: null });
  const teamId = createId();
  await db.insert(teams).values({ id: teamId, clubId, name: "Team", saison: "2526" });
  return teamId;
}

describe.skipIf(isIntegrationDbDisabled)("system retention — sponsor_leads", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("deletes sponsor leads older than the retention window (DSGVO)", async () => {
    const teamId = await makeTeam();
    const now = new Date("2026-07-07T00:00:00Z");
    const old = new Date(now.getTime() - (LEADS_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000);
    const fresh = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

    const oldId = createId();
    const freshId = createId();
    await db.insert(sponsorLeads).values({
      id: oldId,
      teamId,
      name: "Alt Besucher",
      email: "alt@example.de",
      createdAt: old
    });
    await db.insert(sponsorLeads).values({
      id: freshId,
      teamId,
      name: "Neu Besucher",
      email: "neu@example.de",
      createdAt: fresh
    });

    const result = await deleteExpiredSystemRows(now);

    expect(result.leads).toBe(1);
    const remaining = await db.select().from(sponsorLeads);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(freshId);
  });
});
