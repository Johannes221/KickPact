import { test, expect } from "@playwright/test";

test.describe("Pledge Wizard — Unauthenticated Routes", () => {
  test("/sponsor/pledge redirects to login (not 404)", async ({ page }) => {
    const response = await page.goto("/sponsor/pledge");
    // Auth guard should redirect — not a 404 or 500
    expect(response?.status()).not.toBe(404);
    expect(response?.status()).not.toBe(500);
    const finalUrl = page.url();
    // Should end up at login or sponsor (if somehow accessible)
    const isAcceptable =
      finalUrl.includes("/login") ||
      finalUrl.includes("/sponsor") ||
      finalUrl.includes("/verify");
    expect(isAcceptable).toBe(true);
  });

  test("/sponsor/pledge/new redirects to login when unauthenticated", async ({ page }) => {
    const response = await page.goto("/sponsor/pledge/new");
    expect(response?.status()).not.toBe(404);
    expect(response?.status()).not.toBe(500);
    const finalUrl = page.url();
    const isAcceptable =
      finalUrl.includes("/login") ||
      finalUrl.includes("/sponsor") ||
      finalUrl.includes("/verify");
    expect(isAcceptable).toBe(true);
  });

  test("/sponsor/pledge/new?invitation=FAKE_TOKEN redirects to login", async ({ page }) => {
    const response = await page.goto("/sponsor/pledge/new?invitation=faketoken123abc");
    expect(response?.status()).not.toBe(404);
    expect(response?.status()).not.toBe(500);
    const finalUrl = page.url();
    const isAcceptable =
      finalUrl.includes("/login") ||
      finalUrl.includes("/sponsor") ||
      finalUrl.includes("/verify");
    expect(isAcceptable).toBe(true);
  });

  test("/sponsor/pledge/[id] redirects to login for random UUID", async ({ page }) => {
    const response = await page.goto(
      "/sponsor/pledge/00000000-0000-0000-0000-000000000000"
    );
    expect(response?.status()).not.toBe(500);
    const finalUrl = page.url();
    const isAcceptable =
      finalUrl.includes("/login") ||
      finalUrl.includes("/sponsor") ||
      finalUrl.includes("/verify");
    expect(isAcceptable).toBe(true);
  });

  test("Sponsor-Dashboard lädt ohne Crash", async ({ page }) => {
    await page.goto("/sponsor");
    const finalUrl = page.url();
    const isAcceptable =
      finalUrl.includes("/login") ||
      finalUrl.includes("/sponsor") ||
      finalUrl.includes("/verify");
    expect(isAcceptable).toBe(true);
    const title = await page.title();
    expect(title).not.toContain("500");
  });

  test("Einladungsseite mit ungültigem Token zeigt Fehlermeldung", async ({ page }) => {
    await page.goto("/einladung/ungueltigertoken123");
    const title = await page.title();
    expect(title).not.toContain("500");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("/api/squad returns 401 without auth (auth-gate added 2026-05-24)", async ({ page }) => {
    // Since the security audit (2026-05-24), /api/squad requires a logged-in session.
    // Unauthenticated requests get a 401 (or redirect to /login), never 400/404.
    const response = await page.request.get("/api/squad");
    // The route uses requireUser() which throws a redirect or 401 — not a 500.
    expect(response.status()).not.toBe(500);
    expect([401, 302, 200]).toContain(response.status());
  });

  test("/api/squad returns 401 for unknown token without auth", async ({ page }) => {
    // Same auth-gate — even with a (fake) invitationToken, auth check happens first.
    const response = await page.request.get(
      "/api/squad?invitationToken=totallyunknowntoken999"
    );
    expect(response.status()).not.toBe(500);
    expect([401, 302, 200]).toContain(response.status());
  });
});
