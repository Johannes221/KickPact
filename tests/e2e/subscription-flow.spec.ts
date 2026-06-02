/**
 * E2E-Tests: Subscription / Trial-Flow
 *
 * Fokus: was ohne echten Login testbar ist.
 *
 *  a) Abo-Seite ohne Auth → Redirect auf /login
 *  b) Marketing-Pricing-Seite /preise existiert und zeigt Pläne
 *  c) Webhook-Endpoint-Robustheit: POST ohne Signature → 400 (nicht 500)
 *  d) Checkout-Cancel-Flow: ?subscribe_cancelled=1 in der URL → UI reagiert
 */

import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://kickpact.schartl.dev";

// ─── a) Auth-geschützte Abo-Seiten ──────────────────────────────────────────

test.describe("Abo-Seiten — unauthenticated Redirect", () => {
  test("GET /verein/<slug>/abo leitet zu /login um (kein eingeloggter User)", async ({
    page,
  }) => {
    // Wir nutzen einen fiktiven Slug — die Auth-Middleware greift vor dem
    // Slug-Lookup, also erhalten wir in jedem Fall einen Login-Redirect.
    const response = await page.goto(`${BASE}/verein/test-e2e-slug/abo`);
    const finalUrl = page.url();

    // Entweder HTTP-Redirect (307) oder Client-seitiger Redirect zu /login
    expect(finalUrl).toMatch(/\/login/);
    // Kein 500
    if (response) {
      expect(response.status()).not.toBe(500);
    }
  });

  test("GET /verein/<slug>/mannschaft/<id>/abo leitet zu /login um", async ({
    page,
  }) => {
    const response = await page.goto(
      `${BASE}/verein/test-e2e-slug/mannschaft/test-team-id/abo`
    );
    const finalUrl = page.url();
    expect(finalUrl).toMatch(/\/login/);
    if (response) {
      expect(response.status()).not.toBe(500);
    }
  });
});

// ─── b) Marketing-Pricing-Seite ─────────────────────────────────────────────

test.describe("Pricing-Seite /preise", () => {
  test("Seite lädt ohne Server-Error", async ({ page }) => {
    const response = await page.goto(`${BASE}/preise`);
    if (response) {
      expect(response.status()).not.toBe(500);
      expect(response.status()).not.toBe(404);
    }
    const title = await page.title();
    expect(title).not.toContain("500");
  });

  test("Zeigt Basic- und Pro-Pläne", async ({ page }) => {
    await page.goto(`${BASE}/preise`);
    // Mindestens einen Plan-Titel sichtbar
    await expect(page.getByText("Basic").first()).toBeVisible();
    await expect(page.getByText("Pro").first()).toBeVisible();
  });

  test("Zeigt Trial-Hinweis (30 Tage gratis)", async ({ page }) => {
    await page.goto(`${BASE}/preise`);
    // Marketing-Copy für Trial
    const trialText = page.getByText(/30 Tage/i).first();
    await expect(trialText).toBeVisible();
  });

  test("Zeigt Preis-Toggle (Monatlich / Saison)", async ({ page }) => {
    await page.goto(`${BASE}/preise`);
    // Die Seite hat einen Billing-Cycle-Toggle
    const monthly = page.getByText(/Monatlich/i).first();
    await expect(monthly).toBeVisible();
  });
});

// ─── c) Webhook-Endpoint-Robustheit ─────────────────────────────────────────

test.describe("Webhook-Endpoint /api/stripe/webhook", () => {
  test("POST ohne Stripe-Signature → 400, nicht 500", async ({ request }) => {
    const response = await request.post(`${BASE}/api/stripe/webhook`, {
      data: JSON.stringify({ type: "test.event" }),
      headers: {
        "Content-Type": "application/json",
        // Bewusst keine stripe-signature — erwartet 400
      },
    });
    // 400 = "missing-signature" (korrekt)
    // 503 = Stripe nicht konfiguriert (auch akzeptabel für Staging ohne Stripe-Key)
    // Auf keinen Fall 500 (das wäre ein unbehandelter Fehler)
    expect(response.status()).not.toBe(500);
    expect([400, 503]).toContain(response.status());
  });

  test("POST mit falscher Signature → 400 invalid-signature", async ({
    request,
  }) => {
    const response = await request.post(`${BASE}/api/stripe/webhook`, {
      data: JSON.stringify({ type: "test.event", id: "evt_test" }),
      headers: {
        "Content-Type": "application/json",
        "stripe-signature":
          "t=1234567890,v1=invalid_signature_for_testing_purposes",
      },
    });
    expect(response.status()).not.toBe(500);
    // 400 = invalid-signature, 503 = not configured
    expect([400, 503]).toContain(response.status());
  });

  test("Endpoint antwortet innerhalb von 5 Sekunden", async ({ request }) => {
    const start = Date.now();
    await request.post(`${BASE}/api/stripe/webhook`, {
      data: "{}",
      headers: { "Content-Type": "application/json" },
      timeout: 5_000,
    });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5_000);
  });
});

// ─── d) Checkout-Cancel-Flow ─────────────────────────────────────────────────

test.describe("Checkout-Cancel-Flow", () => {
  test("?subscribe_cancelled=1 auf Login-Seite zeigt keinen 500", async ({
    page,
  }) => {
    // Wenn der Checkout abgebrochen wird, leitet Stripe auf die cancel_url zurück.
    // Typische cancel_url: /login?subscribe_cancelled=1 oder /verein/<slug>/abo?subscribe_cancelled=1
    // Da wir nicht eingeloggt sind, testen wir die Login-Seite mit dem Param.
    const response = await page.goto(`${BASE}/login?subscribe_cancelled=1`);
    if (response) {
      expect(response.status()).not.toBe(500);
    }
    const title = await page.title();
    expect(title).not.toContain("500");
    // Seite lädt ohne Crash
    await expect(page.locator("body")).toBeVisible();
  });

  test("?subscribe_cancelled=1 auf Signup-Seite zeigt keinen 500", async ({
    page,
  }) => {
    const response = await page.goto(`${BASE}/signup?subscribe_cancelled=1`);
    if (response) {
      expect(response.status()).not.toBe(500);
    }
    await expect(page.locator("body")).toBeVisible();
  });

  test("Checkout-Success-Redirect-URL /verein/<slug>/abo ist gesichert", async ({
    page,
  }) => {
    // Nach erfolgreichem Checkout landet der User auf der Abo-Seite.
    // Ohne Auth soll er zu /login geleitet werden, nicht crashen.
    const response = await page.goto(
      `${BASE}/verein/test-e2e-slug/abo?checkout_success=1`
    );
    const finalUrl = page.url();
    if (response) {
      expect(response.status()).not.toBe(500);
    }
    // Auth-Middleware greift → Redirect zu /login
    expect(finalUrl).toMatch(/\/login/);
  });
});

// ─── e) Stripe-Checkout-API-Route Smoke ──────────────────────────────────────

test.describe("Checkout-API-Route Schutz", () => {
  test("POST /api/stripe/checkout ohne Auth → 401 oder Redirect", async ({
    request,
  }) => {
    // Diese Route erfordert einen eingeloggten User.
    // Ohne Session-Cookie → 401 oder 307 zu /login.
    const response = await request.post(`${BASE}/api/stripe/checkout`, {
      data: JSON.stringify({ plan: "basic", cycle: "monthly" }),
      headers: { "Content-Type": "application/json" },
      // Playwright request folgt Redirects per Default nicht
    });
    // 401 (unauthorized), 307 (redirect to login), oder 404 (route nicht vorhanden)
    // Auf keinen Fall 500
    expect(response.status()).not.toBe(500);
    expect([400, 401, 403, 404, 307, 308]).toContain(response.status());
  });
});
