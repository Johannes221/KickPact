import { test, expect } from "@playwright/test";

/**
 * Sponsor-Onboarding-Wizard — E2E-Smoke-Tests
 * ============================================
 *
 * Diese Suite prüft die kritischen Pfade des Sponsor-Onboarding-Wizards
 * ohne echten Auth-Login. Abgedeckt:
 *
 * a) Unauthenticated Guard  — /sponsor/onboarding redirectet auf /login
 * b) Opt-out deprecated     — /spieler-opt-out zeigt "nicht verfügbar"-Message (kein 500, kein Form)
 * c) Homepage lädt          — / gibt 200, Titel enthält "KickPact"
 * d) Login-Seite erreichbar — /login zeigt Auth-Formular
 * e) 404-Verhalten          — unbekannte Route gibt Fehlerseite (kein 500, kein JSON-Dump)
 *
 * Hinweis: Kein versuch sich einzuloggen. Vollständige Flow-Tests mit
 * echtem Auth-Bypass sind in onboarding-flows.spec.ts (Suite H) abgedeckt.
 */

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ a) Unauthenticated Guard                                              ║
// ╚═══════════════════════════════════════════════════════════════════════╝

test.describe("Sponsor-Onboarding · Unauthenticated Guard", () => {
  test("/sponsor/onboarding ohne Login redirectet auf /login", async ({ page }) => {
    const response = await page.goto("/sponsor/onboarding");

    // Kein 500-Fehler vom Server
    expect(response?.status()).not.toBe(500);

    // Next.js 15 Auth-Guard löst redirect() aus → HTTP 307 oder Client-seitiger
    // Redirect zu /login. Wir akzeptieren beides.
    const finalUrl = page.url();
    expect(finalUrl).toMatch(/\/login/);
  });

  test("/sponsor/onboarding mit Invitation-Token ohne Login → /login", async ({ page }) => {
    const response = await page.goto("/sponsor/onboarding?invitation=fake-token-xyz");
    expect(response?.status()).not.toBe(500);
    const finalUrl = page.url();
    expect(finalUrl).toMatch(/\/login/);
  });
});

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ b) Opt-out deprecated                                                 ║
// ╚═══════════════════════════════════════════════════════════════════════╝

test.describe("Sponsor-Onboarding · Spieler-Opt-out deprecated", () => {
  test("/spieler-opt-out zeigt 'nicht verfügbar'-Message, kein 500", async ({ page }) => {
    const response = await page.goto("/spieler-opt-out");

    // Kein Server-Error
    expect(response?.status()).not.toBe(500);
    expect(response?.status()).not.toBe(404);

    // Seite zeigt die "nicht verfügbar"-Nachricht
    await expect(
      page.getByText(/nicht verfügbar/i).first()
    ).toBeVisible();

    // Kein Opt-out-Formular vorhanden (Feature ist deprecated)
    const form = page.locator("form");
    await expect(form).toHaveCount(0);
  });

  test("/spieler-opt-out gibt keinen JSON-Dump aus", async ({ page }) => {
    await page.goto("/spieler-opt-out");

    // Seiteninhalt ist kein rohes JSON-Objekt
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/^\s*\{/); // Kein JSON-Dump
    expect(bodyText).not.toContain('"error"');
  });
});

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ c) Homepage lädt                                                      ║
// ╚═══════════════════════════════════════════════════════════════════════╝

test.describe("Sponsor-Onboarding · Homepage", () => {
  test("/ gibt 200 und Titel enthält 'KickPact'", async ({ page }) => {
    const response = await page.goto("/");

    // HTTP 200 — keine Fehler-Response
    expect(response?.status()).toBe(200);

    // Titel muss "KickPact" enthalten
    const title = await page.title();
    expect(title).toContain("KickPact");

    // Kein Fehler-Indikator im Titel
    expect(title).not.toContain("500");
    expect(title).not.toContain("Error");
  });

  test("/ rendert Body-Inhalt (kein leeres Dokument)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).not.toBeEmpty();
    // Mindestens eine Überschrift vorhanden
    const headings = page.getByRole("heading");
    await expect(headings.first()).toBeVisible();
  });
});

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ d) Login-Seite erreichbar                                             ║
// ╚═══════════════════════════════════════════════════════════════════════╝

test.describe("Sponsor-Onboarding · Login-Seite", () => {
  test("/login ist erreichbar und zeigt Auth-Formular", async ({ page }) => {
    const response = await page.goto("/login");

    expect(response?.status()).not.toBe(500);
    expect(response?.status()).not.toBe(404);

    // Formular muss sichtbar sein — E-Mail-Input oder Google-OAuth-Button
    const hasEmailInput = await page.locator("input[type='email'], input[name='email']").count();
    const hasGoogleButton = await page.getByRole("button", { name: /google/i }).count();
    const hasLoginHeading = await page.getByText(/login|anmelden|e-mail/i).count();

    // Mindestens eines der Auth-UI-Elemente vorhanden
    expect(hasEmailInput + hasGoogleButton + hasLoginHeading).toBeGreaterThan(0);
  });

  test("/login enthält Link zur Signup-Seite", async ({ page }) => {
    await page.goto("/login");
    // "Account anlegen" oder ähnlicher Signup-CTA muss erreichbar sein
    const signupLink = page.getByRole("link", { name: /(anlegen|registrieren|signup)/i });
    await expect(signupLink.first()).toBeVisible();
  });
});

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ e) 404-Verhalten                                                      ║
// ╚═══════════════════════════════════════════════════════════════════════╝

test.describe("Sponsor-Onboarding · 404-Verhalten", () => {
  test("/does-not-exist-xyz gibt Fehlerseite (kein 500, kein JSON-Dump)", async ({ page }) => {
    const response = await page.goto("/does-not-exist-xyz");

    // Kein Server-Fehler — 404 ist akzeptiert, 500 nicht
    expect(response?.status()).not.toBe(500);

    // Kein rohes JSON ausgegeben
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/^\s*\{/);

    // Kein leeres Dokument
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("404-Seite enthält keine Stack-Trace-Ausgabe", async ({ page }) => {
    await page.goto("/does-not-exist-xyz");

    const bodyText = await page.locator("body").innerText();
    // Keine rohen Node.js-Stack-Traces sichtbar
    expect(bodyText).not.toContain("at Object.<anonymous>");
    expect(bodyText).not.toContain("node_modules");
  });
});
