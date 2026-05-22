import { test, expect } from "@playwright/test";
import { createId } from "@paralleldrive/cuid2";
import {
  isE2EReady,
  resetE2EDb,
  seedTestUserAndClub,
  authCookie,
  db
} from "./_seed";
import { matches, matchEvents } from "../../../lib/db/schema";

/**
 * Verein-Ereignisse-View E2E (Plan 2026-05-22, Task 7.5).
 *
 * Vereins-Trainer sieht Spielplan + Events des Teams, kann ein Manual-Event
 * melden (z.B. "Hackentor"). Event muss anschließend in der Liste auftauchen.
 */

async function seedFinishedMatch(teamId: string): Promise<{ matchId: string }> {
  const matchId = createId();
  const now = new Date();
  await db.insert(matches).values({
    id: matchId,
    teamId,
    fussballdeSpielId: `E2E_VEREIN_${matchId.slice(0, 8)}`,
    datum: now,
    heimName: "FC Sportfreunde 1910 Dossenheim",
    gastName: "TSV Handschuhsheim",
    ergebnisHeim: 3,
    ergebnisGast: 1,
    halbzeitHeim: 2,
    halbzeitGast: 0,
    status: "finished",
    crawledAt: now
  });
  await db.insert(matchEvents).values({
    id: createId(),
    matchId,
    minute: 22,
    type: "tor",
    side: "heim",
    playerName: "Max Mustermann",
    source: "scraped"
  });
  return { matchId };
}

test.describe("Verein-Ereignisse-View", () => {
  test.beforeEach(async () => {
    if (!isE2EReady()) return;
    await resetE2EDb();
  });

  test("verein sieht Spielplan + meldet Manual-Event", async ({
    page,
    context,
    baseURL
  }) => {
    test.skip(!isE2EReady(), "requires E2E infrastructure");

    const seed = await seedTestUserAndClub();
    await seedFinishedMatch(seed.teamId);
    await context.addCookies([
      authCookie(seed.sessionCookie, baseURL ?? "http://localhost:3000")
    ]);

    await page.goto("/verein/dossenheim/ereignisse");
    await expect(page.getByText(/spiele|ereignisse/i)).toBeVisible();
    await expect(page.getByText("TSV Handschuhsheim")).toBeVisible();

    // Manual-Event hinzufügen
    await page.getByRole("button", { name: /event melden|ereignis melden|hinzufügen/i }).click();
    await page.getByLabel(/Spieler/i).fill("Lukas Wagner");
    await page.getByLabel(/Minute/i).fill("67");
    const typSelect = page.getByLabel(/Typ|Art/i);
    if (await typSelect.evaluate((el) => el.tagName === "SELECT").catch(() => false)) {
      await typSelect.selectOption({ label: /hackentor/i });
    } else {
      await typSelect.click();
      await page.getByRole("option", { name: /hackentor/i }).click();
    }
    await page.getByRole("button", { name: /speichern|absenden/i }).click();

    await expect(page.getByText(/Lukas Wagner/i)).toBeVisible();
    await expect(page.getByText(/Hackentor/i)).toBeVisible();
  });

  test("verein sieht gescrapte Tore in Match-Detail", async ({
    page,
    context,
    baseURL
  }) => {
    test.skip(!isE2EReady(), "requires E2E infrastructure");

    const seed = await seedTestUserAndClub();
    await seedFinishedMatch(seed.teamId);
    await context.addCookies([
      authCookie(seed.sessionCookie, baseURL ?? "http://localhost:3000")
    ]);

    await page.goto("/verein/dossenheim/ereignisse");
    await page.getByText("TSV Handschuhsheim").first().click();
    await expect(page.getByText(/Max Mustermann/i)).toBeVisible();
    await expect(page.getByText(/22/)).toBeVisible();
  });
});
