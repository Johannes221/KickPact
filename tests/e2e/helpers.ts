import { type Page, expect } from "@playwright/test";

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

/**
 * Loggt einen Test-User per Bypass-Endpoint ein. Setzt einen Better-Auth-
 * kompatiblen Session-Cookie im Browser-Context.
 *
 * Voraussetzungen:
 *  - `E2E_TEST_BYPASS_KEY` muss als Env-Var auf dem Server gesetzt sein.
 *  - Der gleiche Key muss im Test-Runner als `E2E_TEST_BYPASS_KEY` verfügbar
 *    sein (über `playwright.config.ts` aus `.env.local` geladen).
 *
 * Bei fehlender Env-Var: Test wird übersprungen.
 *
 * @returns Die User-ID des eingeloggten Users — nützlich für Cleanup.
 */
export async function loginAsTestUser(
  page: Page,
  email: string,
  opts: { name?: string } = {}
): Promise<{ userId: string; email: string }> {
  const key = process.env.E2E_TEST_BYPASS_KEY;
  if (!key) {
    throw new Error(
      "E2E_TEST_BYPASS_KEY ist nicht gesetzt. Test sollte vorher per test.skip() übersprungen werden."
    );
  }
  // page.request ist ein isolierter API-Context: Response-Cookies werden NICHT
  // automatisch in den Browser-Context übertragen. Stattdessen navigieren wir
  // direkt auf die Stub-URL — dann setzt der Server den Cookie im Browser-Context.
  // Wir übergeben die Parameter als Query-String (GET) damit der Browser-Navigation
  // kein JSON-Body schicken muss; der Endpoint unterstützt alternativ GET.
  //
  // Alternativer Ansatz: page.context().addCookies() nach page.request.post().
  // Wir wählen addCookies() weil wir den Server-Response-Header korrekt lesen.
  const response = await page.request.post("/api/test-auth/magic-link-stub", {
    headers: { "x-test-bypass": key, "content-type": "application/json" },
    data: { email, name: opts.name }
  });
  expect(response.ok(), `Stub-Endpoint hat ${response.status()} geliefert`).toBeTruthy();
  const body = (await response.json()) as { userId: string; email: string };

  // Cookie aus dem Response-Header extrahieren und in den Browser-Context laden.
  // Playwright gibt Set-Cookie-Header über response.headersArray() zurück.
  const headers = response.headersArray();
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "https://kickpact.schartl.dev";
  const url = new URL(baseUrl);
  for (const { name, value } of headers) {
    if (name.toLowerCase() !== "set-cookie") continue;
    // Minimalparser: Name=Value; HttpOnly; Secure; SameSite=Lax; Path=/; Expires=...
    const parts = value.split(";").map((p) => p.trim());
    const [cookieNameValue, ...attrs] = parts;
    const eqIdx = cookieNameValue.indexOf("=");
    const cookieName = cookieNameValue.slice(0, eqIdx);
    const cookieValue = cookieNameValue.slice(eqIdx + 1);
    const attrMap: Record<string, string | boolean> = {};
    for (const attr of attrs) {
      const [k, v] = attr.split("=").map((s) => s.trim());
      attrMap[k.toLowerCase()] = v ?? true;
    }
    await page.context().addCookies([
      {
        name: cookieName,
        value: cookieValue,
        domain: url.hostname,
        path: (attrMap["path"] as string) ?? "/",
        httpOnly: "httponly" in attrMap,
        secure: "secure" in attrMap,
        sameSite: (() => {
          const ss = ((attrMap["samesite"] as string) ?? "").toLowerCase();
          if (ss === "strict") return "Strict";
          if (ss === "none") return "None";
          return "Lax";
        })()
      }
    ]);
  }

  return body;
}

/**
 * Skippt einen Test, wenn `E2E_TEST_BYPASS_KEY` nicht gesetzt ist. So
 * vermeiden wir, dass die Suite auf CI ohne konfigurierten Bypass crasht.
 */
export function skipIfNoBypass(): boolean {
  return !process.env.E2E_TEST_BYPASS_KEY;
}

/**
 * Cleanup-Hook: löscht alle Test-User mit Email-Domain `@e2e-test.kickpact.de`
 * und kaskadiert alle ihre Clubs / Memberships / Sessions weg.
 *
 * Wir treffen NUR User mit dieser speziellen Email-Domain, damit echte User
 * niemals versehentlich getroffen werden.
 *
 * Geht direkt gegen die Test-DB über `request.post` auf einen separaten
 * Test-Cleanup-Endpoint — vermeidet ein direktes DB-Modul-Import im Test
 * Runtime (Playwright-Test sind Node, aber mit Edge-/Browser-Constraints
 * im selben Project).
 *
 * In v1 nutzen wir den Stub direkt: wir filtern emails nach `@e2e-test.kickpact.de`
 * im Stub selbst.
 */
export const TEST_EMAIL_DOMAIN = "e2e-test.kickpact.de";

export function testEmail(slug: string): string {
  // Per-test slug + Timestamp, damit parallele Test-Runs nicht kollidieren.
  return `${slug}-${Date.now()}@${TEST_EMAIL_DOMAIN}`;
}

/**
 * Optional: Logout durch Cookie-Clear. Nützlich wenn ein Test als
 * eingeloggter User startet, aber den Auth-State danach loswerden will.
 */
export async function logout(page: Page) {
  await page.context().clearCookies();
}
