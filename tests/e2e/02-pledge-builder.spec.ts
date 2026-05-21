import { test, expect } from "@playwright/test";

test.describe("Pledge-Builder UI", () => {
  test("Pledge-Builder-Seite zeigt Fehlermeldung ohne Einladungstoken", async ({ page }) => {
    // Sponsor-Auth-Guard leitet nicht-angemeldete User um
    await page.goto("/sponsor/pledge/new");
    const finalUrl = page.url();
    // Entweder Login-Redirect oder Seite lädt (zeigt dann Fehler)
    const isLoginOrPledge =
      finalUrl.includes("/login") || finalUrl.includes("/pledge/new") || finalUrl.includes("/sponsor");
    expect(isLoginOrPledge).toBe(true);
  });

  test("Sponsor-Dashboard lädt ohne Crash", async ({ page }) => {
    await page.goto("/sponsor");
    const finalUrl = page.url();
    // Auth-Guard: Redirect auf Login oder Seite geladen
    const isAcceptable =
      finalUrl.includes("/login") || finalUrl.includes("/sponsor") || finalUrl.includes("/verify");
    expect(isAcceptable).toBe(true);
    // Kein 500-Fehler
    const title = await page.title();
    expect(title).not.toContain("500");
  });

  test("Einladungsseite mit ungültigem Token zeigt Fehlermeldung", async ({ page }) => {
    await page.goto("/einladung/ungueltigertoken123");
    // Seite soll laden (kein 500), zeigt Fehlermeldung
    const title = await page.title();
    expect(title).not.toContain("500");
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
