/**
 * Gemeinsamer Guard für die Test-Auth-Endpoints (/magic-link-stub, /cleanup).
 *
 * Zwei Schichten, beide fail-closed mit 404 (NICHT 401 — wir wollen nicht
 * verraten, dass die Route existiert):
 *
 * 1. Production-Gate (Audit 2026-06-10): In Production-Builds ist der Endpoint
 *    HART deaktiviert, außer `ALLOW_TEST_AUTH=true` ist explizit gesetzt.
 *    Vorher hing der Schutz allein an der Geheimhaltung von
 *    E2E_TEST_BYPASS_KEY — ein geleakter Key hätte auf jeder Umgebung
 *    Session-Forging für beliebige E-Mails erlaubt. Gleiches Pattern wie der
 *    Fail-Closed-Check in app/api/inngest/route.ts.
 *
 *    ACHTUNG: Staging (kickpact.schartl.dev) läuft als Production-Build
 *    (NODE_ENV=production) — dort muss ALLOW_TEST_AUTH=true gesetzt sein,
 *    damit Playwright-E2E funktioniert. Auf der echten Production-Umgebung
 *    (kickpact.com) dürfen weder ALLOW_TEST_AUTH noch E2E_TEST_BYPASS_KEY
 *    gesetzt werden — siehe DEPLOYMENT.md.
 *
 * 2. Key-Check: `E2E_TEST_BYPASS_KEY` muss als Env gesetzt sein und der
 *    Request-Header `x-test-bypass` muss mit Konstant-Zeit-Compare matchen.
 */
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

function constantTimeMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

function notFound(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

/**
 * Gibt eine 404-Response zurück, wenn der Request den Test-Auth-Endpoint
 * nicht nutzen darf — sonst `null` (Request darf weiter).
 */
export function guardTestAuth(req: NextRequest): NextResponse | null {
  // Production-Gate ZUERST — greift auch bei korrektem Key.
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_TEST_AUTH !== "true") {
    return notFound();
  }

  const expected = process.env.E2E_TEST_BYPASS_KEY;
  if (!expected) return notFound();

  const provided = req.headers.get("x-test-bypass");
  if (!provided || !constantTimeMatch(provided, expected)) return notFound();

  return null;
}
