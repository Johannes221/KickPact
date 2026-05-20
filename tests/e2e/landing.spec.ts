import { test, expect } from "@playwright/test";

const SHOULD_RUN = process.env.RUN_E2E === "1";
test.skip(!SHOULD_RUN, "E2E only when RUN_E2E=1");

test.describe("Landing Page", () => {
  test("Hero rendert mit Brand + CTAs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Sponsoring/ }).first()).toBeVisible();
    await expect(page.getByText(/das mitfiebert/)).toBeVisible();
    await expect(page.getByText(/weniger als 1/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Verein anlegen.*30 Tage gratis/ }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Ich bin schon dabei/ })).toBeVisible();
  });

  test("Roles-Tabs funktioneren (Sponsor / Verein)", async ({ page }) => {
    await page.goto("/");
    // Default: Verein-Tab aktiv
    await expect(page.getByText(/Aus jedem Spiel/)).toBeVisible();
    // Switch zu Sponsor-Tab
    await page.getByRole("tab", { name: /Du bist Sponsor/ }).click();
    await expect(page.getByText(/Jedes Tor wird zum/)).toBeVisible();
  });

  test("FAQ-Accordion expandiert", async ({ page }) => {
    await page.goto("/");
    const faq = page.getByText(/Sind die Beträge.*steuerlich absetzbar/);
    await faq.click();
    await expect(page.getByText(/Werbeleistung/)).toBeVisible();
  });

  test("Pricing zeigt beide Pläne", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/Basic/).first()).toBeVisible();
    await expect(page.getByText(/9 €/).first()).toBeVisible();
    await expect(page.getByText(/Pro/).first()).toBeVisible();
    await expect(page.getByText(/19 €/).first()).toBeVisible();
  });
});

test.describe("Status Page", () => {
  test("zeigt System-Status + Live-Demo", async ({ page }) => {
    await page.goto("/status");
    await expect(page.getByText(/System-Status/)).toBeVisible();
    await expect(page.getByText("Trigger-Engine", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Live-Demo/ })).toBeVisible();
    // Live-Trigger-Engine demo zeigt Charges generiert
    await expect(page.getByText(/Charges generiert/)).toBeVisible();
  });

  test("DB-Counts werden aus Neon geladen", async ({ page }) => {
    await page.goto("/status");
    await expect(page.getByText(/Postgres.*Neon/)).toBeVisible();
    await expect(page.getByText("online")).toBeVisible();
  });
});

test.describe("Auth-Routes", () => {
  test("/login zeigt Magic-Link-Form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(/Magic-Link/)).toBeVisible();
    await expect(page.getByLabel(/E-Mail/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Magic Link senden/ })).toBeVisible();
  });

  test("/signup zeigt Magic-Link-Form mit Verein-Wording", async ({ page }) => {
    await page.goto("/signup");
    await expect(page.getByText(/Verein anlegen/).first()).toBeVisible();
    await expect(page.getByText(/30 Tage gratis testen/)).toBeVisible();
  });

  test("/onboarding/verein/1 redirected zu /login (kein User)", async ({ page }) => {
    await page.goto("/onboarding/verein/1");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Einladungs-Landing", () => {
  test("Einladung mit ungültigem Token zeigt Fehler-State", async ({ page }) => {
    await page.goto("/einladung/invalid-token-test-12345");
    await expect(page.getByText(/Einladung ungültig/)).toBeVisible();
  });
});

test.describe("Logo + Header", () => {
  test("Logo lädt korrekt im Header", async ({ page }) => {
    await page.goto("/");
    // Header has the K mark SVG
    const header = page.locator("header");
    await expect(header).toBeVisible();
    // Header has "KICK" + "PACT" split text
    await expect(header.locator("text=KICK")).toBeVisible();
    await expect(header.locator("text=PACT")).toBeVisible();
  });
});
