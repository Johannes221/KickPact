/**
 * Apple "Sign in with Apple" verlangt als `clientSecret` ein signiertes JWT,
 * nicht — wie sonst üblich — einen statischen String. Das JWT wird mit dem
 * ES256-Private-Key signiert, den Apple beim Anlegen des Keys als .p8-Datei
 * herausgibt. Das JWT ist maximal 6 Monate gültig.
 *
 * Wir generieren es beim Boot des Servers, sodass die App selbst bei langer
 * Laufzeit nie ein abgelaufenes Secret nutzt.
 *
 * Benötigte Env-Vars:
 *   APPLE_TEAM_ID       — 10-stelliger Team-Identifier (Apple Dev Portal)
 *   APPLE_KEY_ID        — 10-stellige Key-ID des erzeugten Sign-in-Keys
 *   APPLE_CLIENT_ID     — Services-ID (z.B. "com.kickpact.web.auth")
 *   APPLE_PRIVATE_KEY   — Inhalt der .p8-Datei (mehrzeilig, oder mit \n
 *                          escaped). Beginnt mit "-----BEGIN PRIVATE KEY-----".
 */
import { SignJWT, importPKCS8 } from "jose";

let cached: { secret: string; expiresAt: number } | null = null;

export async function getAppleClientSecret(): Promise<string> {
  // Cache für 5 Monate, neu generieren danach (max-Lebensdauer = 6 Monate).
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.secret;
  }

  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const clientId = process.env.APPLE_CLIENT_ID;
  const rawKey = process.env.APPLE_PRIVATE_KEY;

  if (!teamId || !keyId || !clientId || !rawKey) {
    throw new Error(
      "Apple OAuth nicht konfiguriert: APPLE_TEAM_ID, APPLE_KEY_ID, " +
        "APPLE_CLIENT_ID und APPLE_PRIVATE_KEY müssen gesetzt sein."
    );
  }

  // .p8-Datei wird in .env als Multiline gespeichert; \n entkapseln, falls nötig.
  const pkcs8 = rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
  const privateKey = await importPKCS8(pkcs8, "ES256");

  const nowSec = Math.floor(Date.now() / 1000);
  const fiveMonthsSec = 60 * 60 * 24 * 30 * 5;

  const secret = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + fiveMonthsSec)
    .setAudience("https://appleid.apple.com")
    .setSubject(clientId)
    .sign(privateKey);

  cached = { secret, expiresAt: Date.now() + fiveMonthsSec * 1000 };
  return secret;
}

export function isAppleConfigured(): boolean {
  return Boolean(
    process.env.APPLE_TEAM_ID &&
      process.env.APPLE_KEY_ID &&
      process.env.APPLE_CLIENT_ID &&
      process.env.APPLE_PRIVATE_KEY
  );
}
