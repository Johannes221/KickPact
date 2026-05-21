import { type Page } from "@playwright/test";

/**
 * Navigiert zu einer URL und wartet auf vollständiges Laden.
 */
export async function goto(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

/**
 * Füllt ein Magic-Link-Formular aus und submittted es.
 * Annahme: Testumgebung hat kein echtes Mail-Delivery,
 * stattdessen prüfen wir nur den UI-State nach Submit.
 */
export async function fillMagicLinkForm(page: Page, email: string) {
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole("button", { name: /link senden|anmelden|fortfahren/i }).click();
}
