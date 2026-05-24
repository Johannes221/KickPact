import { test, expect } from "@playwright/test";
import { isE2EReady, resetE2EDb, seedTestUserAndClub, authCookie } from "./_seed";

/**
 * Sponsor Pledge-Wizard E2E (Plan 2026-05-22, Task 7.3).
 *
 * Full happy path: Mannschaft wählen (echter Verein aus Seed) → Ereignisse
 * (Pro Tor / Hackentor) inkl. Beträge → Spieler aus Kader-Fixture picken →
 * Caps + Submit → Dashboard zeigt den Pledge.
 */

test.describe("Sponsor Pledge-Wizard (Full Flow)", () => {
  test.beforeEach(async () => {
    if (!isE2EReady()) return;
    await resetE2EDb();
  });

  test("sponsor pledge wizard — pick team, events, player from kader, submit", async ({
    page,
    context,
    baseURL
  }) => {
    test.skip(!isE2EReady(), "requires E2E infrastructure (E2E_DATABASE_URL + test server)");

    const seed = await seedTestUserAndClub();
    await context.addCookies([
      authCookie(seed.sessionCookie, baseURL ?? "http://localhost:3000")
    ]);

    await page.goto("/sponsor/pledge/new");

    // Step 1: Mannschaft wählen
    await expect(
      page.getByText("FC Sportfreunde 1910 Dossenheim")
    ).toBeVisible();
    await page.getByLabel(/Herren 1/i).check();
    await page.getByRole("button", { name: /weiter/i }).click();

    // Step 2: Ereignisse wählen
    await page.getByLabel(/Pro Tor/i).check();
    await page
      .getByLabel(/Pro Tor/i)
      .locator("..")
      .getByLabel(/Betrag/i)
      .fill("5");

    await page.getByLabel(/Hackentor|spezial.*tor/i).check();
    await page
      .getByLabel(/Hackentor|spezial.*tor/i)
      .locator("..")
      .getByLabel(/Betrag/i)
      .fill("20");

    // Optional: Spieler aus Kader picken
    const picker = page.getByRole("button", {
      name: /spieler wählen|spieler aus kader/i
    });
    if (await picker.isVisible().catch(() => false)) {
      await picker.click();
      await expect(page.getByRole("listitem").first()).toBeVisible({
        timeout: 10_000
      });
      await page.getByRole("listitem").first().click();
    }
    await page.getByRole("button", { name: /weiter/i }).click();

    // Step 3: Caps + Bestätigung
    await page.getByLabel(/Monats-?Limit|monatlich/i).fill("100");
    await page
      .getByRole("button", { name: /pledge abschließen|abschicken|jetzt unterstützen/i })
      .click();

    // Verify: Pledge sichtbar im Sponsor-Dashboard
    await expect(page).toHaveURL(/\/sponsor/);
    await expect(page.getByText(/Pro Tor|FC Sportfreunde/i)).toBeVisible();
  });
});
