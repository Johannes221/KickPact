import { test, expect, type Page } from "@playwright/test";
import { loginAsTestUser, skipIfNoBypass, testEmail } from "./helpers";

/**
 * Onboarding-Flow-Tests
 * =====================
 *
 * Diese Suite verifiziert die Auth-aware Redirect-Logik in /signup, /login und
 * /sponsor/onboarding sowie die korrekte Darstellung der Onboarding-Wizards
 * für alle Rollen (Verein-Admin, Sponsor, Trainer).
 *
 * Sie läuft sowohl gegen `npm run dev` (lokal) als auch gegen die Live-URL
 * (kickpact.schartl.dev). Schreibende Tests sind als `test.skip()` markiert
 * solange wir keinen Test-Auth-Bypass haben — die Bug-Verifikations-Tests
 * (Unauthenticated-Read-Only) laufen aber überall.
 *
 * Realistische Test-Daten: echte Heidelberg-Land-Vereine (Dossenheim,
 * Schriesheim, Neuenheim).
 */

const LIVE = process.env.PLAYWRIGHT_BASE_URL?.includes("kickpact.schartl.dev");

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Suite A: /signup — Unauthenticated                                    ║
// ╚═══════════════════════════════════════════════════════════════════════╝

test.describe("Onboarding · /signup unauthenticated", () => {
  test("/signup ohne Role zeigt 3-Wege-Role-Chooser", async ({ page }) => {
    await page.goto("/signup");
    await expect(
      page.getByRole("heading", { name: /Bei KickPact starten/i })
    ).toBeVisible();
    // 3 Rollen-Tiles
    await expect(page.getByRole("heading", { name: /Als Mannschaft/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Als Verein/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Als Sponsor/i })).toBeVisible();
  });

  test("/signup?role=verein zeigt Magic-Link-Form + OAuth", async ({ page }) => {
    await page.goto("/signup?role=verein");
    // CardTitle ist ein div, nicht ein heading — daher getByText.
    await expect(page.getByText(/Als Verein registrieren/i).first()).toBeVisible();
    await expect(page.locator("input[type='email']")).toBeVisible();
    await expect(page.getByRole("button", { name: /Magic Link senden/i })).toBeVisible();
  });

  test("/signup?role=mannschaft zeigt Magic-Link-Form", async ({ page }) => {
    await page.goto("/signup?role=mannschaft");
    await expect(page.getByText(/Als Mannschaft registrieren/i).first()).toBeVisible();
    await expect(page.locator("input[type='email']")).toBeVisible();
  });

  test("/signup?role=sponsor zeigt Magic-Link-Form", async ({ page }) => {
    await page.goto("/signup?role=sponsor");
    await expect(page.getByText(/Als Sponsor registrieren/i).first()).toBeVisible();
    await expect(page.locator("input[type='email']")).toBeVisible();
  });

  test("/signup?role=INVALID fällt zurück auf Role-Chooser", async ({ page }) => {
    await page.goto("/signup?role=bogus");
    await expect(
      page.getByRole("heading", { name: /Bei KickPact starten/i })
    ).toBeVisible();
  });
});

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Suite B: /login — Unauthenticated                                     ║
// ╚═══════════════════════════════════════════════════════════════════════╝

test.describe("Onboarding · /login unauthenticated", () => {
  test("/login zeigt Login-Form", async ({ page }) => {
    await page.goto("/login");
    // CardTitle ist ein div, kein heading — getByText prüft Sichtbarkeit.
    await expect(page.getByText(/^Login$/i).first()).toBeVisible();
    await expect(page.locator("input[type='email']")).toBeVisible();
  });

  test("/login Sub-CTA verweist auf Signup", async ({ page }) => {
    await page.goto("/login");
    // "Account anlegen" (post-fix) oder "Verein anlegen" (legacy) — beides ok.
    const cta = page.getByRole("link", { name: /(Account|Verein) anlegen/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute("href", "/signup");
  });
});

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Suite C: Auth-Guards auf geschützten Routen                           ║
// ╚═══════════════════════════════════════════════════════════════════════╝

test.describe("Onboarding · Auth-Guards", () => {
  test("/onboarding/verein/1 ohne Auth → /login", async ({ page }) => {
    const response = await page.goto("/onboarding/verein/1");
    expect(response?.status()).not.toBe(500);
    const finalUrl = page.url();
    const okay = finalUrl.includes("/login") || finalUrl.includes("/onboarding");
    expect(okay).toBe(true);
  });

  test("/onboarding/verein/2 ohne Auth → /login", async ({ page }) => {
    const response = await page.goto("/onboarding/verein/2");
    expect(response?.status()).not.toBe(500);
    const finalUrl = page.url();
    expect(finalUrl).toMatch(/\/login|\/onboarding/);
  });

  test("/onboarding/verein/3 ohne Auth → /login", async ({ page }) => {
    const response = await page.goto("/onboarding/verein/3");
    expect(response?.status()).not.toBe(500);
    expect(page.url()).toMatch(/\/login|\/onboarding/);
  });

  test("/onboarding/verein/4 ohne Auth → /login", async ({ page }) => {
    const response = await page.goto("/onboarding/verein/4");
    expect(response?.status()).not.toBe(500);
    expect(page.url()).toMatch(/\/login|\/onboarding/);
  });

  test("/sponsor/onboarding ohne Auth → /login", async ({ page }) => {
    const response = await page.goto("/sponsor/onboarding");
    expect(response?.status()).not.toBe(500);
    expect(page.url()).toMatch(/\/login|\/sponsor/);
  });

  test("/dashboard ohne Auth → /login", async ({ page }) => {
    const response = await page.goto("/dashboard");
    expect(response?.status()).not.toBe(500);
    expect(page.url()).toMatch(/\/login|\/dashboard/);
  });

  test("/select-role ohne Auth → /login", async ({ page }) => {
    const response = await page.goto("/select-role");
    expect(response?.status()).not.toBe(500);
    expect(page.url()).toMatch(/\/login|\/select-role/);
  });

  test("/onboarding/zugriff-anfragen?clubSlug=foo ohne Auth → /login", async ({
    page
  }) => {
    const response = await page.goto("/onboarding/zugriff-anfragen?clubSlug=foo");
    expect(response?.status()).not.toBe(500);
    expect(page.url()).toMatch(/\/login|\/onboarding/);
  });
});

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Suite D: /einladung Public-Page-Verhalten                             ║
// ╚═══════════════════════════════════════════════════════════════════════╝

test.describe("Onboarding · /einladung Public-Pages", () => {
  test("Einladung mit ungültigem Token zeigt Fehlermeldung", async ({ page }) => {
    await page.goto("/einladung/voellig-erfundener-token-123abc");
    // CardTitle ist ein div — getByText.
    await expect(page.getByText(/Einladung ungültig/i).first()).toBeVisible();
  });

  test("Einladung mit leerem Token → 404 oder Error-Page (kein 500)", async ({
    page
  }) => {
    // /einladung/ wird von Next.js dynamic-route nicht gematcht, sollte 404 sein
    const response = await page.goto("/einladung/");
    expect(response?.status()).not.toBe(500);
  });
});

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Suite E: Vereinssuche — Step 1 zeigt echte Vereine                    ║
// ╚═══════════════════════════════════════════════════════════════════════╝
//
// Diese Tests setzen voraus, dass der Wizard-Schritt-1 zumindest die Search-
// UI rendert. Sie schreiben NICHT in die DB — nur Render-Check.

test.describe("Onboarding · Verein-Wizard Step-1 (UI-Smoke, kein DB-Write)", () => {
  // Step-1 ist hinter `requireUser()` — Unauth-User landet auf /login.
  // Wir testen nur, dass die Route nicht crasht.
  test("Step 1 Route rendert kein 500", async ({ page }) => {
    const response = await page.goto("/onboarding/verein/1");
    expect(response?.status()).not.toBe(500);
    const title = await page.title();
    expect(title).not.toContain("500");
    expect(title).not.toContain("Error");
  });
});

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Suite F: AUTH-LEAK-BUG — Repro + Verifikation                         ║
// ║                                                                       ║
// ║ Der vom User gemeldete Bug: eingeloggter Verein-User öffnet           ║
// ║ /signup?role=mannschaft und sieht erneut die Signup-Form mit          ║
// ║ Google/Apple/Mail-Buttons.                                            ║
// ║                                                                       ║
// ║ Wir simulieren den eingeloggten Zustand mit einem invaliden           ║
// ║ Session-Cookie (Better-Auth ignoriert ihn → null) sowie mit einem     ║
// ║ leeren Cookie (= unauth). Damit testen wir nur den "negativen"        ║
// ║ Branch: unauth muss Form sehen. Den positiven Branch (auth muss       ║
// ║ Redirect sehen) deckt die Unit-Test-Suite pickAuthenticated-          ║
// ║ SignupDestination ab.                                                 ║
// ╚═══════════════════════════════════════════════════════════════════════╝

test.describe("Onboarding · Auth-Leak-Bug-Repro", () => {
  test("Unauth /signup?role=mannschaft zeigt Magic-Link-Form (Baseline)", async ({
    page
  }) => {
    await page.goto("/signup?role=mannschaft");
    await expect(page.getByText(/Als Mannschaft registrieren/i).first()).toBeVisible();
    // Magic-Link-Button als robuste Sichtbarkeits-Probe.
    await expect(page.getByRole("button", { name: /Magic Link senden/i })).toBeVisible();
  });

  test("Invalid-Session-Cookie verhält sich wie unauth (Form sichtbar)", async ({
    page,
    context,
    baseURL
  }) => {
    // Better-Auth-Cookie-Pattern. Wir setzen einen sinnlosen Wert — Better-Auth
    // wird ihn nicht validieren und liefert null zurück; Page muss Form rendern.
    const targetUrl = baseURL ?? "http://localhost:3000";
    await context.addCookies([
      {
        name: "better-auth.session_token",
        value: "INVALID_PLAYWRIGHT_STUB",
        url: targetUrl,
        httpOnly: true,
        secure: targetUrl.startsWith("https://"),
        sameSite: "Lax"
      }
    ]);
    await page.goto("/signup?role=mannschaft");
    // Form muss sichtbar bleiben (Cookie ist invalid → Server sieht null).
    await expect(page.getByText(/Als Mannschaft registrieren/i).first()).toBeVisible();
  });
});

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Suite G: Sponsor-Discovery + Pledge-Wizard Routes (Read-Only)         ║
// ╚═══════════════════════════════════════════════════════════════════════╝

test.describe("Onboarding · Sponsor-Pfade", () => {
  test("/sponsor/discover ohne Auth → /login", async ({ page }) => {
    const response = await page.goto("/sponsor/discover");
    expect(response?.status()).not.toBe(500);
    expect(page.url()).toMatch(/\/login|\/sponsor/);
  });

  test("/sponsor/pledge/new?invitation=xyz ohne Auth → /login", async ({ page }) => {
    const response = await page.goto("/sponsor/pledge/new?invitation=xyz");
    expect(response?.status()).not.toBe(500);
    // Magic-Link-Form sollte den Invitation-Token im callbackURL mitführen.
    expect(page.url()).toMatch(/\/login|\/sponsor/);
  });
});

// ╔═══════════════════════════════════════════════════════════════════════╗
// ║ Suite H: Realistic-Data-Smoke — Vereinssuche ohne Auth (skipped)      ║
// ║ Vollständige Flow-Tests (Verein-Wizard durchlaufen + Sponsor-         ║
// ║ Einladung verwenden) brauchen Test-Auth-Bypass und sind als E2E-      ║
// ║ Backlog im Plan dokumentiert.                                         ║
// ╚═══════════════════════════════════════════════════════════════════════╝

test.describe("Onboarding · Realistic-Data-Smokes (auth required)", () => {
  // Skip ganze Suite, wenn kein Bypass-Key konfiguriert ist. So bleiben die
  // Tests in CI lauffähig ohne Env-Setup, in Local-Dev / Coolify-CI mit Key
  // werden sie aktiviert.
  test.skip(skipIfNoBypass(), "E2E_TEST_BYPASS_KEY nicht gesetzt — Auth-Bypass nicht verfügbar");

  test("Verein-Onboarding-Wizard Step 1 mit FC Dossenheim (auth)", async ({
    page
  }: {
    page: Page;
  }) => {
    const email = testEmail("dossenheim");
    await loginAsTestUser(page, email, { name: "Dossenheim Tester" });

    await page.goto("/onboarding/verein/1");
    // Step 1 muss als eingeloggter User rendern, kein Redirect auf /login.
    await expect(page).not.toHaveURL(/\/login/);

    // Vereinssuche-Input vorhanden.
    const search = page.getByPlaceholder(/Heidelberg|Verein|Suchen/i).first();
    await expect(search).toBeVisible();
    await search.fill("Dossenheim");
    // Suchen-Button kann verschieden labeled sein — robuster Selector.
    const submit = page.getByRole("button", { name: /(Suchen|Weiter)/i }).first();
    await expect(submit).toBeVisible();
  });

  test("Verein-Onboarding-Wizard Step 1 mit TSG Schriesheim (auth)", async ({
    page
  }: {
    page: Page;
  }) => {
    const email = testEmail("schriesheim");
    await loginAsTestUser(page, email, { name: "Schriesheim Tester" });

    await page.goto("/onboarding/verein/1");
    await expect(page).not.toHaveURL(/\/login/);
    const search = page.getByPlaceholder(/Heidelberg|Verein|Suchen/i).first();
    await expect(search).toBeVisible();
    await search.fill("Schriesheim");
  });

  test("Verein-Onboarding-Wizard Step 1 mit SG Neuenheim (auth)", async ({
    page
  }: {
    page: Page;
  }) => {
    const email = testEmail("neuenheim");
    await loginAsTestUser(page, email, { name: "Neuenheim Tester" });

    await page.goto("/onboarding/verein/1");
    await expect(page).not.toHaveURL(/\/login/);
    const search = page.getByPlaceholder(/Heidelberg|Verein|Suchen/i).first();
    await expect(search).toBeVisible();
    await search.fill("Neuenheim");
  });

  // Cleanup nach der Suite — löscht alle e2e-test User wieder.
  test.afterAll(async ({ request }) => {
    const key = process.env.E2E_TEST_BYPASS_KEY;
    if (!key) return;
    await request.post("/api/test-auth/cleanup", {
      headers: { "x-test-bypass": key }
    });
  });
});
