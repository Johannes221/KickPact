import { headers } from "next/headers";
import Redis from "ioredis";

/**
 * SECURITY (M5): Rate-Limiter für öffentliche Server-Actions (Kontaktformular,
 * Sponsor-Anfragen). Better-Auth limitiert nur `/api/auth/*`, nicht Server-Actions.
 *
 * Zwei Backends:
 *  - **Redis** (wenn `REDIS_URL` gesetzt): geteilter, instanz-übergreifender
 *    Zähler via atomarem `INCR` + `PEXPIRE` (Fixed-Window). Robust bei mehreren
 *    App-Instanzen.
 *  - **In-Memory-Fallback** (kein `REDIS_URL` oder Redis-Fehler): pro-Instanz,
 *    Sliding-Window. Reset bei Deploy/Neustart. Kein harter, aber wirksamer
 *    Flooding-Schutz.
 *
 * Bei JEDEM Redis-Fehler (Timeout, Down) fällt der Aufruf still auf In-Memory
 * zurück — ein Redis-Ausfall darf niemals einen legitimen Request blocken.
 */

// ── Redis (lazy singleton) ────────────────────────────────────────────────
let redis: Redis | null = null;
let redisInitTried = false;

function getRedis(): Redis | null {
  if (redisInitTried) return redis;
  redisInitTried = true;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 1500,
      // Verhindert lautes Crash-Verhalten — Fehler werden geschluckt, Fallback greift.
      lazyConnect: false
    });
    redis.on("error", () => {
      /* swallow — der try/catch in rateLimit fällt auf In-Memory zurück */
    });
    return redis;
  } catch {
    redis = null;
    return null;
  }
}

// ── In-Memory-Fallback ────────────────────────────────────────────────────
type Bucket = number[]; // Timestamps (ms) der jüngsten Treffer
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < windowMs) return;
  lastSweep = now;
  for (const [key, hits] of buckets) {
    const fresh = hits.filter((t) => now - t < windowMs);
    if (fresh.length === 0) buckets.delete(key);
    else buckets.set(key, fresh);
  }
}

function rateLimitInMemory(
  key: string,
  opts: { limit: number; windowMs: number }
): boolean {
  const now = Date.now();
  sweep(now, opts.windowMs);
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < opts.windowMs);
  if (hits.length >= opts.limit) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

/**
 * Liefert true, wenn der Aufruf ERLAUBT ist (unter dem Limit), und registriert
 * ihn. Liefert false, wenn das Limit für `key` im Fenster überschritten ist.
 *
 * Async, weil Redis async ist. Bei fehlendem Redis/Fehler synchroner Fallback.
 */
export async function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): Promise<boolean> {
  const r = getRedis();
  if (r) {
    try {
      const redisKey = `rl:${key}`;
      const count = await r.incr(redisKey);
      // Nur beim ersten Treffer im Fenster die TTL setzen.
      if (count === 1) {
        await r.pexpire(redisKey, opts.windowMs);
      }
      return count <= opts.limit;
    } catch {
      // Redis nicht erreichbar → still auf In-Memory zurückfallen.
    }
  }
  return rateLimitInMemory(key, opts);
}

/**
 * Best-effort Client-IP aus den Proxy-Headern (Coolify/Cloudflare setzen
 * x-forwarded-for / cf-connecting-ip). Fällt auf "unknown" zurück.
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return h.get("cf-connecting-ip") ?? h.get("x-real-ip") ?? "unknown";
}
