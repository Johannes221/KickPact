import { headers } from "next/headers";

/**
 * SECURITY (M5): Leichtgewichtiger In-Memory-Sliding-Window-Rate-Limiter für
 * öffentliche Server-Actions (Kontaktformular, Sponsor-Anfragen). Kein Redis im
 * Stack → der Zähler lebt pro Server-Instanz und wird beim Deploy/Neustart
 * zurückgesetzt. Das ist KEIN harter Schutz, aber bremst Flooding/Spam wirksam
 * (Better-Auth limitiert nur `/api/auth/*`, nicht Server-Actions).
 *
 * Für mehrere Instanzen / harte Garantien später auf einen geteilten Store
 * (Upstash/DB) umstellen — die API hier bleibt dann gleich.
 */
type Bucket = number[]; // Timestamps (ms) der jüngsten Treffer
const buckets = new Map<string, Bucket>();

// Letzte Aufräum-Zeit, damit die Map nicht unbegrenzt wächst.
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

/**
 * Liefert true, wenn der Aufruf ERLAUBT ist (unter dem Limit), und registriert
 * ihn. Liefert false, wenn das Limit für `key` im Fenster überschritten ist.
 */
export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number }
): boolean {
  const now = Date.now();
  sweep(now, opts.windowMs);
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < opts.windowMs);
  if (hits.length >= opts.limit) {
    buckets.set(key, hits); // gefilterten Stand zurückschreiben
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
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
