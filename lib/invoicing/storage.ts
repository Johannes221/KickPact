import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * PDF-Storage mit 3-Tier-Fallback:
 *
 * 1. **S3-kompatibel (R2/Hetzner Object Storage)** — wenn alle R2-Env-Vars
 *    gesetzt sind. Es werden beide Schreibweisen gelesen (CLOUDFLARE_R2_*
 *    bevorzugt, R2_* als Fallback), damit R2 auch in Coolify-Umgebungen aktiv
 *    wird. Endpoint via *_R2_ENDPOINT konfigurierbar damit Hetzner-S3 auch
 *    funktioniert (Default: Cloudflare R2).
 * 2. **Persistent Volume** unter `PDF_STORAGE_PATH` (Default `/data/kickpact-pdfs`)
 *    — wird in Coolify als Persistent Volume gemountet. Funktioniert ohne
 *    externes Object-Storage.
 * 3. **`/tmp/kickpact-pdfs`** — lokaler Dev-Fallback, verschwindet beim Restart.
 *
 * Storage-URLs sind opaque keys mit Schema-Prefix: `r2://<bucket>/<key>`
 * oder `local://<rel-path>`. `getDownloadUrl()` mappt sie zu nutzbaren
 * Browser-URLs (signiert für R2, App-interne Stream-Route für local).
 */

// Coolify-Staging/Prod nutzt CLOUDFLARE_R2_* — wir lesen beide Schreibweisen
// (CLOUDFLARE_R2_* bevorzugt, R2_* als Fallback), konsistent mit
// lib/storage/documents.ts. Vorher nur R2_* → in Coolify war R2 nie aktiv und
// Invoice-PDFs fielen aufs lokale Volume zurück.
const R2_ACCESS_KEY_ID =
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY =
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.CLOUDFLARE_R2_BUCKET ?? process.env.R2_BUCKET;
const R2_ENDPOINT = process.env.CLOUDFLARE_R2_ENDPOINT ?? process.env.R2_ENDPOINT;
const R2_ACCOUNT_ID = process.env.CLOUDFLARE_R2_ACCOUNT_ID ?? process.env.R2_ACCOUNT_ID;

const hasR2 = !!R2_ACCESS_KEY_ID && !!R2_SECRET_ACCESS_KEY && !!R2_BUCKET;

const r2Endpoint =
  R2_ENDPOINT ??
  (R2_ACCOUNT_ID ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null);

const s3 =
  hasR2 && r2Endpoint
    ? new S3Client({
        region: "auto",
        endpoint: r2Endpoint,
        credentials: {
          accessKeyId: R2_ACCESS_KEY_ID!,
          secretAccessKey: R2_SECRET_ACCESS_KEY!
        }
      })
    : null;

/**
 * Lokaler Storage-Pfad. Auf Staging/Production via Coolify Persistent Volume
 * gemountet (siehe Coolify-App-Config). Lokal/Dev fällt es auf /tmp/ zurück.
 */
const LOCAL_DIR = process.env.PDF_STORAGE_PATH ?? "/data/kickpact-pdfs";
const DEV_FALLBACK = "/tmp/kickpact-pdfs";

async function ensureWritable(dir: string): Promise<string> {
  try {
    await fs.mkdir(dir, { recursive: true });
    // Schreibtest — bei Read-Only-FS (z.B. `/data` ohne Volume-Mount) sofort
    // auf DEV_FALLBACK ausweichen
    const probe = path.join(dir, `.write-test-${Date.now()}`);
    await fs.writeFile(probe, "ok");
    await fs.unlink(probe);
    return dir;
  } catch {
    await fs.mkdir(DEV_FALLBACK, { recursive: true });
    return DEV_FALLBACK;
  }
}

/**
 * Speichert ein PDF und gibt eine opaque Storage-URL zurück, die
 * `getDownloadUrl()` zu einer Browser-tauglichen URL auflösen kann.
 */
export async function storePdf(key: string, body: Buffer): Promise<string> {
  if (s3 && R2_BUCKET) {
    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: body,
        ContentType: "application/pdf"
      })
    );
    return `r2://${R2_BUCKET}/${key}`;
  }
  const baseDir = await ensureWritable(LOCAL_DIR);
  const relPath = key.replace(/\//g, "_");
  const fullPath = path.join(baseDir, relPath);
  await fs.writeFile(fullPath, body);
  return `local://${relPath}`;
}

/**
 * Generiert eine Browser-taugliche URL für ein gespeichertes PDF.
 * - R2: signierte URL, 1h gültig
 * - Local: App-interne Route `/api/invoices/pdf?key=...` die mit Auth streamt
 */
export async function getDownloadUrl(storedUrl: string): Promise<string> {
  if (storedUrl.startsWith("r2://") && s3) {
    const withoutScheme = storedUrl.slice("r2://".length);
    const slashIdx = withoutScheme.indexOf("/");
    const bucket = withoutScheme.slice(0, slashIdx);
    const key = withoutScheme.slice(slashIdx + 1);
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: 3600
    });
  }
  if (storedUrl.startsWith("local://")) {
    const relPath = storedUrl.slice("local://".length);
    return `/api/invoices/pdf?key=${encodeURIComponent(relPath)}`;
  }
  // Legacy `file://`-URLs aus früheren Versionen — best-effort: extrahiere
  // basename und schicke an die local-stream-Route.
  if (storedUrl.startsWith("file://")) {
    const base = path.basename(storedUrl.slice("file://".length));
    return `/api/invoices/pdf?key=${encodeURIComponent(base)}`;
  }
  return storedUrl;
}

/**
 * Streamt das PDF vom lokalen Storage. Nur über die App-interne Route mit
 * Auth-Check verwendbar.
 */
export async function readLocalPdf(relPath: string): Promise<Buffer> {
  // Path-Sanitization gegen Traversal
  const safe = relPath.replace(/[^a-zA-Z0-9_.\-]/g, "_");
  const candidates = [LOCAL_DIR, DEV_FALLBACK];
  for (const dir of candidates) {
    const full = path.join(dir, safe);
    try {
      return await fs.readFile(full);
    } catch {
      // try next
    }
  }
  throw new Error(`PDF not found: ${relPath}`);
}
