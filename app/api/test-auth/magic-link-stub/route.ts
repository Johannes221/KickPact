/**
 * E2E-Test-Auth-Bypass.
 *
 * STRENG GUARD-ED:
 *  - Aktiv nur wenn `E2E_TEST_BYPASS_KEY` als Env-Var gesetzt ist.
 *  - Request muss Header `x-test-bypass: <KEY>` mit Konstant-Zeit-Compare matchen.
 *  - Fehlt die Env oder matched der Header nicht → 404 (NICHT 401 — wir wollen
 *    nicht verraten, dass die Route existiert).
 *
 * Was es macht:
 *  - POST { email, name? } → Sicherstellen dass User in `users` existiert,
 *    eine neue `sessions`-Zeile anlegen, Better-Auth-Cookie setzen.
 *  - 200 { userId, email } bei Erfolg.
 *
 * Was es NICHT macht:
 *  - Keine Magic-Link-Mail senden (kein Resend-Call).
 *  - Keine OAuth-Flow-Schritte.
 *  - Keine Logs (kein PII-Leak, kein Audit-Spam von Tests).
 *
 * WICHTIG — Cookie-Signing:
 *  Better-Auth verwendet signierte Cookies im Format `token.HMAC_SIGNATURE`.
 *  Der rohe Session-Token muss mit BETTER_AUTH_SECRET via HMAC-SHA256 signiert
 *  werden bevor er als Cookie gesetzt wird, sonst schlägt getSignedCookie() fehl.
 */
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual, randomBytes } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, sessions } from "@/lib/db/schema/auth";

/**
 * Repliziert Better-Auth's makeSignature() aus better-auth/dist/crypto/index.mjs.
 * Cookie-Wert-Format: `rawToken.base64(HMAC-SHA256(rawToken, secret))`
 */
async function signCookieToken(token: string, secret: string): Promise<string> {
  const secretBuf = new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    secretBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)));
  return `${token}.${sigBase64}`;
}

// 7 Tage Session-Lifetime — gleicher Default wie Better-Auth.
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.E2E_TEST_BYPASS_KEY;
  if (!expected) return notFound();

  const provided = req.headers.get("x-test-bypass");
  if (!provided || !constantTimeMatch(provided, expected)) return notFound();

  let body: { email?: string; name?: string };
  try {
    body = (await req.json()) as { email?: string; name?: string };
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  // User upsert
  const [existing] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  let userId: string;
  if (existing) {
    userId = existing.id;
  } else {
    userId = createId();
    await db.insert(users).values({
      id: userId,
      email,
      emailVerified: true,
      name: body.name ?? null
    });
  }

  // Session anlegen
  const sessionToken = randomBytes(32).toString("base64url");
  const sessionId = createId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id: sessionId,
    userId,
    token: sessionToken,
    expiresAt,
    ipAddress: null,
    userAgent: "playwright-test-bypass"
  });

  // Better-Auth-Cookie setzen. Default-Name ist `better-auth.session_token`.
  // WICHTIG: Better-Auth liest Cookies via getSignedCookie() — das erwartet den
  // Cookie-Wert im Format `token.HMAC-SHA256-Signatur` (Base64).
  // Signaturalgorithmus: Web Crypto HMAC-SHA256 → btoa(String.fromCharCode(...bytes))
  // Exakt gleiche Implementierung wie better-auth/dist/crypto/index.mjs makeSignature().
  const secret = process.env.BETTER_AUTH_SECRET!;
  const signedSessionToken = await signCookieToken(sessionToken, secret);

  const isHttps = (process.env.BETTER_AUTH_URL ?? "").startsWith("https://");
  // Better-Auth verwendet bei useSecureCookies (=> HTTPS) den `__Secure-`-Prefix
  // (z.B. `__Secure-better-auth.session_token`). Ohne diesen Prefix liest
  // getSignedCookie() den Cookie auf HTTPS nicht — der Bypass wäre auf
  // Staging/Prod wirkungslos. Auf HTTP bleibt der Name ungeprefixt.
  const baseCookieName =
    process.env.BETTER_AUTH_COOKIE_NAME ?? "better-auth.session_token";
  const cookieName = isHttps ? `__Secure-${baseCookieName}` : baseCookieName;
  const res = NextResponse.json({ userId, email });
  res.cookies.set({
    name: cookieName,
    value: signedSessionToken,
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    path: "/",
    expires: expiresAt
  });
  return res;
}
