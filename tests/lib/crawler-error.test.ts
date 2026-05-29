import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { markCrawlError, markCrawlCompleted } from "@/lib/db/queries/crawler";
import { resetTestDb } from "../setup/db";
import { isIntegrationDbDisabled } from "../setup/integration-db";

async function makeTeam(): Promise<string> {
  const clubId = createId();
  await db.insert(clubs).values({ id: clubId, slug: `c-${clubId.slice(0, 6)}`, name: "C", logoUrl: null });
  const teamId = createId();
  await db.insert(teams).values({ id: teamId, clubId, name: "T", saison: "2526" });
  return teamId;
}

describe.skipIf(isIntegrationDbDisabled)("crawl error markers", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("records an error and clears it on successful completion", async () => {
    const teamId = await makeTeam();

    await markCrawlError(teamId, "fussball.de timeout");
    let [row] = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(row.crawlLastError).toBe("fussball.de timeout");
    expect(row.crawlLastErrorAt).not.toBeNull();

    await markCrawlCompleted(teamId);
    [row] = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(row.crawlLastError).toBeNull();
    expect(row.crawlLastErrorAt).toBeNull();
    expect(row.crawlCompletedAt).not.toBeNull();
  });

  it("truncates very long error messages", async () => {
    const teamId = await makeTeam();
    await markCrawlError(teamId, "x".repeat(2000));
    const [row] = await db.select().from(teams).where(eq(teams.id, teamId));
    expect(row.crawlLastError?.length).toBe(1000);
  });
});
