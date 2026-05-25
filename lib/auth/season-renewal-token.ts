import crypto from "node:crypto";

/**
 * Plan 3 Teil 2 — Saison-Renewal-Token (HMAC-SHA256).
 *
 * Identisches Format wie `lib/auth/opt-out-token.ts`, nur mit anderem
 * Payload:
 *
 *   Payload: { pledgeId, nextSaison, iat, exp }
 *
 * Secret: BETTER_AUTH_SECRET (>= 16 chars), identisch zum Player-Opt-out.
 *
 * Replay-Schutz: nicht stark — der Token kann zwar mehrfach
 * eingelöst werden, aber `clonePledgeForNextSeason` ist idempotent
 * (existierende Klone werden wiederverwendet, nicht doppelt erzeugt).
 */

export interface SeasonRenewalTokenPayload {
  pledgeId: string;
  /** Ziel-Saison-Kürzel, z.B. "2627". */
  nextSaison: string;
  iat: number;
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

export function signSeasonRenewalToken(
  payload: SeasonRenewalTokenPayload
): string {
  if (!payload.pledgeId) throw new Error("pledgeId required");
  if (!payload.nextSaison) throw new Error("nextSaison required");
  if (
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number"
  ) {
    throw new Error("iat/exp must be numbers");
  }
  const json = JSON.stringify(payload);
  const payloadEnc = base64UrlEncode(Buffer.from(json, "utf8"));
  const sig = hmac(payloadEnc, getSecret());
  const sigEnc = base64UrlEncode(sig);
  return `${payloadEnc}.${sigEnc}`;
}

export function verifySeasonRenewalToken(
  token: string
): SeasonRenewalTokenPayload {
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

  let payload: SeasonRenewalTokenPayload;
  try {
    const json = base64UrlDecode(payloadEnc).toString("utf8");
    payload = JSON.parse(json) as SeasonRenewalTokenPayload;
  } catch {
    throw new Error("Ungültiger Link-Inhalt.");
  }

  if (
    !payload ||
    typeof payload.pledgeId !== "string" ||
    typeof payload.nextSaison !== "string" ||
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
