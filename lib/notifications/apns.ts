import http2 from "node:http2";
import { createPrivateKey, sign as cryptoSign } from "node:crypto";

/**
 * Zero-Dependency APNs-Transport (HTTP/2 + ES256-Provider-JWT).
 *
 * Bewusst keine externe Lib (`apn`/`node-apn` unmaintained). Node-Bordmittel
 * reichen: `crypto.sign(..., { dsaEncoding: "ieee-p1363" })` liefert die
 * ECDSA-Signatur direkt im JOSE-R||S-Format, und `node:http2` spricht APNs.
 *
 * NUR Node-Runtime (kein Edge). Reiner Transport — kein DB-Zugriff.
 */

export interface ApnsPayload {
  title: string;
  body: string;
  /** Zusatzfelder neben `aps` (z.B. { link, matchId }). */
  data?: Record<string, unknown>;
  badge?: number;
}

export interface ApnsResult {
  token: string;
  ok: boolean;
  /** HTTP/2 `:status` (0 = Transport-/Verbindungsfehler vor einer Antwort). */
  status: number;
  /** APNs `reason` aus dem Fehler-Body, falls vorhanden. */
  reason?: string;
}

/** Pluggable für Tests — die echte Implementierung öffnet HTTP/2 zu Apple. */
export type ApnsSender = (tokens: string[], payload: ApnsPayload) => Promise<ApnsResult[]>;

interface ApnsConfig {
  keyId: string;
  teamId: string;
  bundleId: string;
  privateKey: string;
  production: boolean;
}

const PROD_HOST = "https://api.push.apple.com";
const SANDBOX_HOST = "https://api.sandbox.push.apple.com";

/**
 * Liest die APNs-Konfiguration aus der Umgebung. Gibt `null` zurück, wenn etwas
 * fehlt ODER der Private Key kein echtes PEM ist (z.B. noch der Platzhalter aus
 * dem Infra-Setup) — dann ist der gesamte Push-Versand ein sauberer No-Op.
 */
function readConfig(): ApnsConfig | null {
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const rawKey = process.env.APNS_PRIVATE_KEY;
  const bundleId = process.env.APNS_BUNDLE_ID?.trim() || "com.kickpact.app";
  if (!keyId || !teamId || !rawKey) return null;

  // Coolify-Env kann den PEM ein-zeilig mit literalem "\n" halten.
  const privateKey = rawKey.replace(/\\n/g, "\n").trim();
  if (!privateKey.includes("BEGIN PRIVATE KEY")) return null; // Platzhalter o.ä.

  return {
    keyId,
    teamId,
    bundleId,
    privateKey,
    production: process.env.APNS_PRODUCTION === "true"
  };
}

/** True, wenn ein vollständiges, plausibles APNs-Setup vorliegt. */
export function isApnsConfigured(): boolean {
  return readConfig() !== null;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/**
 * Baut das ES256-Provider-JWT für APNs. Header `{alg:"ES256",kid}`,
 * Claims `{iss:teamId,iat}`. Exportiert für Unit-Tests (Verifikation gegen den
 * Public Key).
 */
export function buildProviderToken(
  cfg: { keyId: string; teamId: string; privateKey: string },
  nowSeconds: number
): string {
  const header = base64url(JSON.stringify({ alg: "ES256", kid: cfg.keyId }));
  const claims = base64url(JSON.stringify({ iss: cfg.teamId, iat: nowSeconds }));
  const signingInput = `${header}.${claims}`;
  const key = createPrivateKey(cfg.privateKey);
  // dsaEncoding "ieee-p1363" -> rohe R||S-Signatur (64 Byte), exakt JOSE-Format.
  const signature = cryptoSign("sha256", Buffer.from(signingInput), {
    key,
    dsaEncoding: "ieee-p1363"
  });
  return `${signingInput}.${base64url(signature)}`;
}

// Provider-Token ist bis 1 h wiederverwendbar (APNs verlangt > 20 min Cache).
let cached: { token: string; createdAt: number; keyId: string } | null = null;

function getProviderToken(cfg: ApnsConfig): string {
  const nowMs = Date.now();
  if (cached && cached.keyId === cfg.keyId && nowMs - cached.createdAt < 50 * 60 * 1000) {
    return cached.token;
  }
  const token = buildProviderToken(cfg, Math.floor(nowMs / 1000));
  cached = { token, createdAt: nowMs, keyId: cfg.keyId };
  return token;
}

function buildApsBody(payload: ApnsPayload): Record<string, unknown> {
  const aps: Record<string, unknown> = {
    alert: { title: payload.title, body: payload.body },
    sound: "default"
  };
  if (typeof payload.badge === "number") aps.badge = payload.badge;
  return { aps, ...(payload.data ?? {}) };
}

/**
 * „Verdächtige" Gründe: dauerhaft ungültig sein KANN, aber auch das exakte
 * Symptom einer globalen Fehlkonfiguration ist (falscher APNS_PRODUCTION-Host,
 * falsches Topic) — dann antwortet Apple für JEDEN Token so. Werden getrennt
 * behandelt, damit ein Env-Fehler nicht die Token aller User löscht.
 */
const SUSPECT_REASONS = new Set(["BadDeviceToken", "DeviceTokenNotForTopic"]);

/** Eindeutig tot: Gerät deinstalliert / Token abgelaufen. Env-unabhängig. */
const HARD_DEAD_REASONS = new Set(["Unregistered"]);

/**
 * True, wenn der Grund ein Env-/Topic-Fehlkonfig-Symptom ist (BadDeviceToken /
 * DeviceTokenNotForTopic). Für sich genommen KEIN sicherer Löschgrund.
 */
export function isSuspectTokenResult(r: ApnsResult): boolean {
  return r.reason != null && SUSPECT_REASONS.has(r.reason);
}

/**
 * True, wenn die APNs-Antwort bedeutet, dass der Token dauerhaft ungültig ist
 * (Gerät deinstalliert / Token abgelaufen / falsche App) → grundsätzlich
 * aufräumbar. Der Aufrufer muss zusätzlich gegen Mass-Failure absichern (s.
 * `sendPushToUser`): ein kompletter Batch aus lauter `isSuspectTokenResult`
 * ist fast sicher eine Fehlkonfiguration, kein echter Token-Tod.
 */
export function isDeadTokenResult(r: ApnsResult): boolean {
  return (
    r.status === 410 ||
    (r.reason != null && (HARD_DEAD_REASONS.has(r.reason) || SUSPECT_REASONS.has(r.reason)))
  );
}

function sendOne(
  client: http2.ClientHttp2Session,
  token: string,
  body: string,
  jwt: string,
  bundleId: string
): Promise<ApnsResult> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r: ApnsResult) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    try {
      const req = client.request({
        ":method": "POST",
        ":path": `/3/device/${token}`,
        authorization: `bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json"
      });
      let status = 0;
      let data = "";
      req.setEncoding("utf8");
      req.on("response", (headers) => {
        status = Number(headers[":status"]) || 0;
      });
      req.on("data", (chunk) => {
        data += chunk;
      });
      req.on("end", () => {
        let reason: string | undefined;
        if (data) {
          try {
            reason = JSON.parse(data).reason as string | undefined;
          } catch {
            /* nicht-JSON-Body ignorieren */
          }
        }
        done({ token, ok: status === 200, status, reason });
      });
      req.on("error", (err) => {
        done({ token, ok: false, status: 0, reason: err instanceof Error ? err.message : "RequestError" });
      });
      req.write(body);
      req.end();
    } catch (err) {
      done({ token, ok: false, status: 0, reason: err instanceof Error ? err.message : "RequestError" });
    }
  });
}

/**
 * Echter APNs-Sender: öffnet eine HTTP/2-Session, multiplext alle Tokens
 * darüber und schließt sie. Wirft nie — gibt pro Token ein Ergebnis zurück.
 */
export const realApnsSender: ApnsSender = async (tokens, payload) => {
  const cfg = readConfig();
  if (!cfg) {
    return tokens.map((token) => ({ token, ok: false, status: 0, reason: "NotConfigured" }));
  }

  let client: http2.ClientHttp2Session;
  try {
    const jwt = getProviderToken(cfg);
    const body = JSON.stringify(buildApsBody(payload));
    client = http2.connect(cfg.production ? PROD_HOST : SANDBOX_HOST);
    // Verbindungsfehler nicht als unhandled 'error' eskalieren lassen.
    client.on("error", () => {});

    const results = await Promise.all(
      tokens.map((token) => sendOne(client, token, body, jwt, cfg.bundleId))
    );
    client.close();
    return results;
  } catch (err) {
    const reason = err instanceof Error ? err.message : "ApnsError";
    return tokens.map((token) => ({ token, ok: false, status: 0, reason }));
  }
};
