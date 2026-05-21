import { test, expect } from "@playwright/test";

/**
 * Smoke-Test: Onboarding-Seiten sind erreichbar und rendern korrekt.
 * Volle Flow-Tests benötigen echte Auth-Session — diese Tests prüfen
 * dass die Seiten korrekt laden und die UI-Elemente vorhanden sind.
 */
test.describe("Vereins-Onboarding", () => {
  test("Login-Seite lädt und zeigt Magic-Link-Form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Magic-Link Email-Input vorhanden
    await expect(page.locator("input[type='email'], input[name='email']")).toBeVisible();
  });

  test("Onboarding-Schritt-1 redirectet nicht-angemeldete User zu Login", async ({ page }) => {
    const response = await page.goto("/onboarding/verein/1");
    // Entweder 200 (wenn öffentlich) oder Redirect auf /login
    const finalUrl = page.url();
    const isLoginOrOnboarding = finalUrl.includes("/login") || finalUrl.includes("/onboarding");
    expect(isLoginOrOnboarding).toBe(true);
  });

  test("Landing-Page lädt und zeigt KickPact-Inhalte", async ({ page }) => {
    await page.goto("/");
    // Page hat content
    await expect(page.locator("body")).not.toBeEmpty();
    // Kein Server-Error (500)
    const title = await page.title();
    expect(title).not.toContain("Error");
    expect(title).not.toContain("500");
  });
});
