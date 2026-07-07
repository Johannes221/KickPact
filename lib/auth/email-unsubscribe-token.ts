import crypto from "node:crypto";

/**
 * E-Mail-Abmelde-Token: HMAC-SHA256 signiertes Compact-Token im
 * URL-safe Base64-Format — identisches Format wie `opt-out-token.ts` /
 * `season-renewal-token.ts`, nur mit `userId` als Subject.
 *
 * Aufbau:  `<base64url(payload)>.<base64url(sig)>`
 * Payload: `{ userId: string, iat: number (unix-sec), exp: number (unix-sec) }`
 *
 * Verwendung: der List-Unsubscribe-Link (RFC 8058 One-Click + sichtbarer
 * „Abmelden"-Link) in WIEDERKEHRENDEN Mails. Kein Login nötig — der Klick
 * setzt `notification_settings.email_recurring = false`. Idempotent.
 *
 * Kein extra Dep (JWT/jose) für eine Single-Purpose-Funktion; HMAC mit
 * BETTER_AUTH_SECRET ist konzeptionell HS256 ohne Algo-Switch-Angriff.
 */

export interface EmailUnsubscribeTokenPayload {
  userId: string;
  /** Issued-At, Unix-Sekunden. */
  iat: number;
  /** Expires-At, Unix-Sekunden. */
  exp: number;
}

function getSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "BETTER_AUTH_SECRET not set or too short (>= 16 chars required)."
    );
  }
  return secret;
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Buffer {
  const pad = (4 - (str.length % 4)) % 4;
  return Buffer.from(
    str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad),
    "base64"
  );
}

function hmac(payload: string, secret: string): Buffer {
  return crypto.createHmac("sha256", secret).update(payload).digest();
}

export function signEmailUnsubscribeToken(
  payload: EmailUnsubscribeTokenPayload
): string {
  if (!payload.userId) throw new Error("userId required");
  if (typeof payload.iat !== "number" || typeof payload.exp !== "number") {
    throw new Error("iat/exp must be numbers");
  }
  const json = JSON.stringify(payload);
  const payloadEnc = base64UrlEncode(Buffer.from(json, "utf8"));
  const sig = hmac(payloadEnc, getSecret());
  const sigEnc = base64UrlEncode(sig);
  return `${payloadEnc}.${sigEnc}`;
}

/**
 * Verifiziert einen Token. Wirft bei jedem Fehler (Aufrufer fängt und
 * zeigt eine freundliche Meldung). Timing-safe HMAC-Vergleich.
 */
export function verifyEmailUnsubscribeToken(
  token: string
): EmailUnsubscribeTokenPayload {
  if (typeof token !== "string" || !token.includes(".")) {
    throw new Error("Ungültiger Link.");
  }
  const [payloadEnc, sigEnc] = token.split(".");
  if (!payloadEnc || !sigEnc) throw new Error("Ungültiger Link.");

  const expectedSig = hmac(payloadEnc, getSecret());
  let providedSig: Buffer;
  try {
    providedSig = base64UrlDecode(sigEnc);
  } catch {
    throw new Error("Ungültiger Link.");
  }
  if (
    providedSig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(providedSig, expectedSig)
  ) {
    throw new Error("Link-Signatur ungültig.");
  }

  let payload: EmailUnsubscribeTokenPayload;
  try {
    const json = base64UrlDecode(payloadEnc).toString("utf8");
    payload = JSON.parse(json) as EmailUnsubscribeTokenPayload;
  } catch {
    throw new Error("Ungültiger Link-Inhalt.");
  }

  if (
    !payload ||
    typeof payload.userId !== "string" ||
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    throw new Error("Ungültiger Link-Inhalt.");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp < nowSec) {
    throw new Error("Dieser Link ist abgelaufen.");
  }

  return payload;
}
