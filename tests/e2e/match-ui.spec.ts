import { test, expect } from "@playwright/test";

const SHOULD_RUN = process.env.RUN_E2E === "1";
test.skip(!SHOULD_RUN, "E2E only when RUN_E2E=1");

test.describe("Match-UI + Inbox (Plan 3)", () => {
  test("Match-Detail Route ohne Auth → redirect /login", async ({ page }) => {
    // Random match-id, club-slug — wir testen nur die Auth-Guard
    await page.goto("/verein/test-slug/spiel/fake-match-id");
    await expect(page).toHaveURL(/\/login/);
  });

  test("Sponsor-Inbox Route ohne Auth → redirect /login", async ({ page }) => {
    await page.goto("/sponsor/inbox");
    await expect(page).toHaveURL(/\/login/);
  });

  test("Sponsoren-Manager Route ohne Auth → redirect /login", async ({ page }) => {
    await page.goto("/verein/test-slug/sponsoren");
    await expect(page).toHaveURL(/\/login/);
  });

  test("Team-Detail Route ohne Auth → redirect /login", async ({ page }) => {
    await page.goto("/verein/test-slug/mannschaft/fake-team-id");
    await expect(page).toHaveURL(/\/login/);
  });

  test("Abrechnungen-Stub Route ohne Auth → redirect /login", async ({ page }) => {
    await page.goto("/verein/test-slug/abrechnungen");
    await expect(page).toHaveURL(/\/login/);
  });

  test("Sponsor-Rechnungen-Stub Route ohne Auth → redirect /login", async ({ page }) => {
    await page.goto("/sponsor/rechnungen");
    await expect(page).toHaveURL(/\/login/);
  });
});
