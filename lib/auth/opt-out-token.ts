import crypto from "node:crypto";

/**
 * Player-Opt-out-Token: HMAC-SHA256 signiertes Compact-Token im
 * URL-safe Base64-Format.
 *
 * Aufbau:  `<base64url(payload)>.<base64url(sig)>`
 * Payload: `{ playerId: string, iat: number (unix-sec), exp: number (unix-sec) }`
 *
 * Bewusste Entscheidung gegen JWT/jose: Wir wollen keinen extra Dep für
 * eine Single-Use-Funktion. HMAC mit BETTER_AUTH_SECRET ist konzeptionell
 * identisch (HS256 ohne den Algo-Switch-Angriff).
 *
 * Replay-Schutz: Der Token kann mehrfach gesendet werden, aber
 * `confirmPlayerOptOut` ist idempotent — der zweite Call setzt nichts neu
 * und schickt keine Mail.
 */

export interface OptOutTokenPayload {
  playerId: string;
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

export function signOptOutToken(payload: OptOutTokenPayload): string {
  if (!payload.playerId) throw new Error("playerId required");
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
 * Verifiziert einen Token. Wirft bei jedem Fehler — Aufrufer fängt und
 * mappt auf User-Friendly-Message. Timing-safe HMAC-Vergleich.
 */
export function verifyOptOutToken(token: string): OptOutTokenPayload {
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

  let payload: OptOutTokenPayload;
  try {
    const json = base64UrlDecode(payloadEnc).toString("utf8");
    payload = JSON.parse(json) as OptOutTokenPayload;
  } catch {
    throw new Error("Ungültiger Link-Inhalt.");
  }

  if (
    !payload ||
    typeof payload.playerId !== "string" ||
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
