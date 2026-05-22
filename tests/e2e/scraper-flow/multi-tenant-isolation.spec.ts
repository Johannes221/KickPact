import { test, expect } from "@playwright/test";
import { isE2EReady, resetE2EDb, seedTwoTenants, authCookie } from "./_seed";

/**
 * Multi-Tenant-Isolation E2E (Plan 2026-05-22, Task 7.7) — KRITISCH.
 *
 * IDOR (Insecure Direct Object Reference) Tests: Sponsor A darf nicht sehen
 * / modifizieren was Sponsor B gehört, und Trainer-Verein-X darf nicht die
 * Subscription von Verein Y berühren. Wenn einer dieser Tests RED ist —
 * Security-Lücke gefunden, sofortiger Fix-Push erforderlich.
 *
 * Test-Layout: `seedTwoTenants()` legt Verein A + Verein B + Sponsor A +
 * Sponsor B + 1 Pledge & 1 Invoice für B an. A versucht dann B-Resources
 * zu lesen/schreiben → muss 403/404 sehen.
 */

test.describe("Multi-Tenant-Isolation (IDOR-Checks)", () => {
  test.beforeEach(async () => {
    if (!isE2EReady()) return;
    await resetE2EDb();
  });

  test("Sponsor A sieht keine Pledges von Sponsor B im Dashboard", async ({
    page,
    context,
    baseURL
  }) => {
    test.skip(!isE2EReady(), "requires E2E infrastructure");

    const { a, b } = await seedTwoTenants();
    await context.addCookies([
      authCookie(a.sessionCookie, baseURL ?? "http://localhost:3000")
    ]);

    await page.goto("/sponsor");
    const allText = await page.content();
    // B's pledge-ID darf NICHT in A's Dashboard auftauchen
    expect(allText).not.toContain(b.pledgeId);
    expect(allText).not.toContain("Verein B");
  });

  test("Sponsor A bekommt 403/404 für /sponsor/pledge/<B-pledge-id>", async ({
    page,
    context,
    baseURL
  }) => {
    test.skip(!isE2EReady(), "requires E2E infrastructure");

    const { a, b } = await seedTwoTenants();
    await context.addCookies([
      authCookie(a.sessionCookie, baseURL ?? "http://localhost:3000")
    ]);

    const resp = await page.goto(`/sponsor/pledge/${b.pledgeId}`);
    const status = resp?.status() ?? 0;
    // Erwartet: 403 (forbidden) oder 404 (not found, Variante: "verstecke Existenz")
    expect([403, 404]).toContain(status);
  });

  test("Sponsor A bekommt 403/404 für /api/invoices/<B-invoice-id>", async ({
    context,
    baseURL,
    request
  }) => {
    test.skip(!isE2EReady(), "requires E2E infrastructure");

    const { a, b } = await seedTwoTenants();
    await context.addCookies([
      authCookie(a.sessionCookie, baseURL ?? "http://localhost:3000")
    ]);

    const resp = await request.get(`/api/invoices/${b.invoiceId}`);
    expect([401, 403, 404]).toContain(resp.status());
  });

  test("Sponsor A kann keine B-Invoice via PDF-Endpoint herunterladen", async ({
    context,
    baseURL,
    request
  }) => {
    test.skip(!isE2EReady(), "requires E2E infrastructure");

    const { a, b } = await seedTwoTenants();
    await context.addCookies([
      authCookie(a.sessionCookie, baseURL ?? "http://localhost:3000")
    ]);

    const resp = await request.get(`/api/invoices/${b.invoiceId}/pdf`);
    expect([401, 403, 404]).toContain(resp.status());
  });

  test("Unangemeldeter User bekommt 401/redirect für /sponsor/pledge/<id>", async ({
    page
  }) => {
    test.skip(!isE2EReady(), "requires E2E infrastructure");

    const { b } = await seedTwoTenants();
    // Kein Cookie gesetzt → Auth-Gate muss greifen
    const resp = await page.goto(`/sponsor/pledge/${b.pledgeId}`);
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    // Entweder direkter 401/403/404 oder Redirect zu /login
    const ok =
      [401, 403, 404].includes(status) ||
      finalUrl.includes("/login") ||
      finalUrl.includes("/verify");
    expect(ok).toBe(true);
  });

  test("Trainer von Verein A kann keinen Stripe-Plan von Verein B ändern", async ({
    context,
    baseURL,
    request
  }) => {
    test.skip(!isE2EReady(), "requires E2E infrastructure");

    const { a, b } = await seedTwoTenants();
    await context.addCookies([
      authCookie(a.sessionCookie, baseURL ?? "http://localhost:3000")
    ]);

    // Endpoint-Pfade können variieren — wir probieren beide bekannten Varianten.
    const candidates = [
      `/api/stripe/checkout?clubId=${b.clubId}`,
      `/api/clubs/${b.clubId}/subscription`,
      `/api/verein/${b.clubId}/abo`
    ];
    let blocked = false;
    for (const path of candidates) {
      const resp = await request
        .post(path, { data: { plan: "pro" }, failOnStatusCode: false })
        .catch(() => null);
      if (!resp) continue;
      if ([401, 403, 404].includes(resp.status())) {
        blocked = true;
        break;
      }
      // 405 method-not-allowed ist auch ok (Endpoint existiert nicht in dieser Form)
      if (resp.status() === 405) {
        blocked = true;
        break;
      }
    }
    expect(blocked).toBe(true);
  });

  test("Trainer von Verein A bekommt 403/404 für /verein/<B-slug>/einstellungen", async ({
    page,
    context,
    baseURL
  }) => {
    test.skip(!isE2EReady(), "requires E2E infrastructure");

    const { a } = await seedTwoTenants();
    await context.addCookies([
      authCookie(a.sessionCookie, baseURL ?? "http://localhost:3000")
    ]);

    const resp = await page.goto("/verein/verein-b/einstellungen");
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    const ok =
      [401, 403, 404].includes(status) ||
      finalUrl.includes("/login") ||
      finalUrl.includes("/verein/verein-a"); // redirect to own verein
    expect(ok).toBe(true);
  });
});
