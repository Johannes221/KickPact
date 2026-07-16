import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * General-purpose document storage with the same 3-tier fallback as
 * lib/invoicing/storage.ts:
 *
 *   1. S3-compatible (R2/Hetzner Object Storage) when R2_*-env-vars are set
 *   2. Persistent volume under DOC_STORAGE_PATH (default /data/kickpact-docs)
 *   3. /tmp/kickpact-docs as dev-fallback
 *
 * Storage-URLs are opaque keys with scheme prefix: `r2://<bucket>/<key>` or
 * `local://<rel-path>`. `getDocumentSignedUrl` resolves them to short-lived
 * browser-usable URLs (10-min default for verification docs — operator review,
 * not user download).
 */

// Env-Var-Namen: Coolify-Staging/Prod nutzt CLOUDFLARE_R2_* — wir lesen beide
// Schreibweisen (CLOUDFLARE_R2_* bevorzugt, R2_* als Fallback), damit R2 in
// allen Umgebungen aktiv wird. Vorher hieß es nur R2_* → in Coolify war R2 nie
// aktiv und Doc-Uploads fielen auf ein nicht gemountetes Volume zurück.
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

const LOCAL_DIR = process.env.DOC_STORAGE_PATH ?? "/data/kickpact-docs";
const DEV_FALLBACK = "/tmp/kickpact-docs";

async function ensureWritable(dir: string): Promise<string> {
  try {
    await fs.mkdir(dir, { recursive: true });
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
 * Stores a document and returns an opaque storage URL.
 *
 * NOTE on testing: this function performs real network I/O when R2 is
 * configured. Unit tests should mock it; integration tests in CI should
 * use the local-volume fallback. There are no tests in Phase E1 — verified
 * manually during the upload-form smoke test.
 */
export async function storeDocument(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  if (s3 && R2_BUCKET) {
    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType
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
 * Löscht ein gespeichertes Dokument (DSGVO Art. 17 / Speicherbegrenzung) —
 * Gegenstück zu storeDocument. Nimmt die von storeDocument zurückgegebene
 * storageUrl (`r2://<bucket>/<key>` bzw. `local://<relPath>`). Best-effort für
 * lokale Dateien; fremde URLs (z.B. OAuth-Provider-Avatare) fallen no-op durch.
 */
export async function deleteDocument(storageUrl: string): Promise<void> {
  if (!storageUrl) return;
  if (storageUrl.startsWith("r2://") && s3) {
    const withoutScheme = storageUrl.slice("r2://".length);
    const slashIdx = withoutScheme.indexOf("/");
    const bucket = withoutScheme.slice(0, slashIdx);
    const key = withoutScheme.slice(slashIdx + 1);
    await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return;
  }
  if (storageUrl.startsWith("local://")) {
    const relPath = storageUrl
      .slice("local://".length)
      .replace(/[^a-zA-Z0-9_.\-]/g, "_");
    await fs.rm(path.join(LOCAL_DIR, relPath), { force: true }).catch(() => {});
  }
}

/**
 * Returns a short-lived signed URL for downloading a document. 10 min
 * default — verification docs are reviewed once by an operator and don't
 * need long-lived URLs.
 */
export async function getDocumentSignedUrl(
  storageKey: string,
  ttlSeconds = 600
): Promise<string> {
  if (storageKey.startsWith("r2://") && s3) {
    const withoutScheme = storageKey.slice("r2://".length);
    const slashIdx = withoutScheme.indexOf("/");
    const bucket = withoutScheme.slice(0, slashIdx);
    const key = withoutScheme.slice(slashIdx + 1);
    return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: ttlSeconds
    });
  }
  if (storageKey.startsWith("local://")) {
    const relPath = storageKey.slice("local://".length);
    return `/api/documents/download?key=${encodeURIComponent(relPath)}`;
  }
  return storageKey;
}

/**
 * Liest ein gespeichertes Dokument als Bytes — für Server-seitiges Einbetten
 * (Story-/Share-Bilder: next/og-Satori kann NUR data-URIs/absolute URLs, und
 * eine signierte R2-URL erst zu holen und dann selbst zu fetchen wäre ein
 * unnötiger Umweg über das Netz).
 *
 * Liefert `null` statt zu werfen, wenn das Dokument fehlt/unlesbar ist: die
 * Aufrufer (Story-Wappen) fallen dann sauber auf ihr Kürzel zurück, statt dass
 * ein fehlendes Logo das ganze Bild kippt.
 */
export async function readDocumentBytes(storageUrl: string): Promise<Buffer | null> {
  if (!storageUrl) return null;
  try {
    if (storageUrl.startsWith("r2://") && s3) {
      const withoutScheme = storageUrl.slice("r2://".length);
      const slashIdx = withoutScheme.indexOf("/");
      const bucket = withoutScheme.slice(0, slashIdx);
      const key = withoutScheme.slice(slashIdx + 1);
      const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const bytes = await res.Body?.transformToByteArray();
      return bytes ? Buffer.from(bytes) : null;
    }
    if (storageUrl.startsWith("local://")) {
      return await readLocalDocument(storageUrl.slice("local://".length));
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Reads a document from the local volume. Only callable via the
 * authenticated download API route (Phase E2).
 */
export async function readLocalDocument(relPath: string): Promise<Buffer> {
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
  throw new Error(`Document not found: ${relPath}`);
}

/**
 * Builds a deterministic storage-key for a verification document.
 * Path-convention: verifications/<clubId>/<verificationId>-<sanitized-filename>.
 * Sanitizing strips path-traversal characters; max 100 chars.
 */
export function buildVerificationKey(args: {
  clubId: string;
  verificationId: string;
  filename: string;
}): string {
  const safe = args.filename
    .replace(/[^a-zA-Z0-9_.\-]/g, "_")
    .slice(0, 100);
  return `verifications/${args.clubId}/${args.verificationId}-${safe}`;
}

/**
 * Builds a storage-key for a team-verification document.
 * Path-convention: verifications/teams/<teamId>/<verificationId>-<sanitized-filename>.
 */
export function buildTeamVerificationKey(args: {
  teamId: string;
  verificationId: string;
  filename: string;
}): string {
  const safe = args.filename
    .replace(/[^a-zA-Z0-9_.\-]/g, "_")
    .slice(0, 100);
  return `verifications/teams/${args.teamId}/${args.verificationId}-${safe}`;
}
