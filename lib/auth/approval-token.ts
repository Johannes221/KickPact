import crypto from "node:crypto";

/**
 * Approval-Token: HMAC-SHA256 signiertes Compact-Token im URL-safe Base64-Format.
 *
 * Aufbau:  `<base64url(payload)>.<base64url(sig)>`
 * Payload: `{ approvalId, action, iat, exp }`
 *
 * Analog zu opt-out-token.ts — kein extra Dep, konzeptionell identisch zu HS256.
 *
 * Replay-Schutz: confirmApprovalByToken / disputeApprovalByToken sind idempotent —
 * bereits verarbeitete Approvals liefern trotzdem { ok: true }.
 */

export type ApprovalAction = "confirm" | "dispute";

export interface ApprovalTokenPayload {
  approvalId: string;
  action: ApprovalAction;
  /** Issued-At, Unix-Sekunden. */
  iat: number;
  /** Expires-At, Unix-Sekunden. */
  exp: number;
}

const TOKEN_TTL_DAYS = 30;

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

export function signApprovalToken(
  approvalId: string,
  action: ApprovalAction
): string {
  if (!approvalId) throw new Error("approvalId required");
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: ApprovalTokenPayload = {
    approvalId,
    action,
    iat: nowSec,
    exp: nowSec + TOKEN_TTL_DAYS * 24 * 60 * 60
  };
  const json = JSON.stringify(payload);
  const payloadEnc = base64UrlEncode(Buffer.from(json, "utf8"));
  const sig = hmac(payloadEnc, getSecret());
  const sigEnc = base64UrlEncode(sig);
  return `${payloadEnc}.${sigEnc}`;
}

/**
 * Verifiziert einen Approval-Token. Wirft bei jedem Fehler.
 * Timing-safe HMAC-Vergleich.
 */
export function verifyApprovalToken(token: string): ApprovalTokenPayload {
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

  let payload: ApprovalTokenPayload;
  try {
    const json = base64UrlDecode(payloadEnc).toString("utf8");
    payload = JSON.parse(json) as ApprovalTokenPayload;
  } catch {
    throw new Error("Ungültiger Link-Inhalt.");
  }

  if (
    !payload ||
    typeof payload.approvalId !== "string" ||
    (payload.action !== "confirm" && payload.action !== "dispute") ||
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
