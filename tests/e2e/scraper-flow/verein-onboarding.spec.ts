import { test, expect } from "@playwright/test";
import { isE2EReady, resetE2EDb } from "./_seed";

/**
 * Verein-Onboarding E2E (Plan 2026-05-22, Task 7.2).
 *
 * Full happy path: Register → Vereinssuche (echte Fixture) → Mannschaft
 * wählen → Stammdaten → Einladungslink. Setzt voraus dass der Magic-Link-Flow
 * im Test-Mode via Helper umgangen wird (z.B. via NEXT_PUBLIC_E2E=true und
 * direkt-Login-Endpoint), oder der seed-Helper liefert einen vorab-eingeloggten
 * Cookie.
 *
 * Solange E2E_DATABASE_URL nicht gesetzt ist (Phase 7 läuft ohne Test-DB-Infra
 * im aktuellen Worktree), wird der Test geskippt — aber das Test-File ist
 * committed und ready-to-go.
 */

test.describe("Verein-Onboarding (Full Flow)", () => {
  test.beforeEach(async () => {
    if (!isE2EReady()) return;
    await resetE2EDb();
  });

  test("verein onboarding — search Dossenheim, pick team, fill stammdaten, get invite link", async ({
    page
  }) => {
    test.skip(!isE2EReady(), "requires E2E infrastructure (E2E_DATABASE_URL + test server)");

    // 1. Register / Magic-Link
    await page.goto("/login");
    await page.getByLabel(/e-?mail/i).fill("trainer@dossenheim.test");
    await page
      .getByRole("button", { name: /link senden|anmelden|magic link/i })
      .click();
    // Test-Mode: Magic-Link wird via E2E-Helper-Endpoint direkt confirmed.
    // Sobald wir hier durch sind, sind wir eingeloggt.

    // 2. Onboarding Step 1 — Vereinssuche (echte Fixture)
    await page.goto("/onboarding/verein/1");
    await page.getByPlaceholder(/verein suchen|name|suche/i).fill("Dossenheim");
    await page.getByRole("button", { name: /suchen|weiter/i }).click();
    await expect(
      page.getByText("FC Sportfreunde 1910 Dossenheim")
    ).toBeVisible({ timeout: 10_000 });
    await page.getByText("FC Sportfreunde 1910 Dossenheim").click();

    // 3. Step 2 — Mannschafts-Auswahl
    await expect(page.getByText(/Herren 1/i)).toBeVisible();
    await page.getByLabel(/Herren 1/i).check();
    await page.getByRole("button", { name: /weiter/i }).click();

    // 4. Step 3 — Stammdaten
    await page.getByLabel(/Straße|Strasse/i).fill("Bahnhofstr. 1");
    await page.getByLabel(/PLZ/i).fill("69221");
    await page.getByLabel(/Ort|Stadt/i).fill("Dossenheim");
    await page.getByLabel(/IBAN/i).fill("DE89 3704 0044 0532 0130 00");
    await page.getByRole("button", { name: /weiter/i }).click();

    // 5. Step 4 — Sponsor-Einladungslink
    await expect(page.getByText(/einladungslink|sponsor einladen/i)).toBeVisible();
    const link = await page
      .getByRole("link", { name: /link kopieren|sponsor einladen|einladung/i })
      .getAttribute("href");
    expect(link).toMatch(/\/(sponsor\/onboarding|einladung)/);
    expect(link).toMatch(/token=|[A-Za-z0-9]{8,}/);
  });
});
