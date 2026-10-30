import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Kurzzeitiges öffentliches Hosting für den Instagram-Upload.
 *
 * WARUM ÜBERHAUPT:
 * Der Instagram-Login-Weg (graph.instagram.com) nimmt Medien NICHT als
 * Datei-Upload, sondern ausschließlich als öffentlich erreichbare URL (live
 * verifiziert: „The parameter video_url is required"). Meta holt sich die Datei
 * selbst von der URL ab. Also: Asset kurz nach R2, signierte Link erzeugen,
 * posten, Asset wieder löschen.
 *
 * Signierte GET-Links statt öffentlicher Bucket: der Bucket bleibt privat, der
 * Link trägt die Freigabe in sich und läuft von allein ab. Meta lädt die Datei
 * innerhalb von Sekunden beim Container-Anlegen — eine Stunde Gültigkeit ist mehr
 * als genug.
 *
 * Nutzt dieselbe R2-Konfiguration wie die App (lib/storage/documents.ts), damit
 * es keine zweite Wahrheit gibt: CLOUDFLARE_R2_* bevorzugt, R2_* als Fallback.
 */

const ACCESS_KEY_ID =
  process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ?? process.env.R2_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY =
  process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ?? process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.CLOUDFLARE_R2_BUCKET ?? process.env.R2_BUCKET;
const ENDPOINT = process.env.CLOUDFLARE_R2_ENDPOINT ?? process.env.R2_ENDPOINT;
const ACCOUNT_ID = process.env.CLOUDFLARE_R2_ACCOUNT_ID ?? process.env.R2_ACCOUNT_ID;

const endpoint =
  ENDPOINT ?? (ACCOUNT_ID ? `https://${ACCOUNT_ID}.r2.cloudflarestorage.com` : null);

export const hasR2 = Boolean(ACCESS_KEY_ID && SECRET_ACCESS_KEY && BUCKET && endpoint);

const client =
  hasR2 && endpoint
    ? new S3Client({
        region: "auto",
        endpoint,
        credentials: { accessKeyId: ACCESS_KEY_ID!, secretAccessKey: SECRET_ACCESS_KEY! }
      })
    : null;

/** Warum R2 (noch) nicht nutzbar ist — für eine ehrliche Fehlermeldung. */
export function r2Reason(): string {
  const fehlt = [
    !ACCESS_KEY_ID && "CLOUDFLARE_R2_ACCESS_KEY_ID",
    !SECRET_ACCESS_KEY && "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
    !BUCKET && "CLOUDFLARE_R2_BUCKET",
    !endpoint && "CLOUDFLARE_R2_ENDPOINT (oder _ACCOUNT_ID)"
  ].filter(Boolean);
  return fehlt.length
    ? `R2 nicht konfiguriert — fehlt in .env.local: ${fehlt.join(", ")}`
    : "R2 ok";
}

/** Alle Temp-Objekte tragen dieses Präfix — so sind sie als flüchtig erkennbar. */
const PREFIX = "social-publish-tmp/";

/**
 * Asset hochladen und einen signierten, eine Stunde gültigen GET-Link
 * zurückgeben. `key` ist ein Aufrufer-Name (z.B. der Slug), eindeutig gemacht
 * per Zeitstempel, damit parallele Läufe sich nicht überschreiben.
 */
export async function uploadTemp(
  name: string,
  data: Buffer,
  contentType: string
): Promise<{ key: string; url: string }> {
  if (!client || !BUCKET) throw new Error(r2Reason());
  // Kein Math.random (in manchen Kontexten verboten) — Zeit + Länge reichen zur
  // Eindeutigkeit innerhalb eines Laufs.
  const key = `${PREFIX}${Date.now()}-${data.length}-${name}`;
  await client.send(
    new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: data, ContentType: contentType })
  );
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: 3600 }
  );
  return { key, url };
}

/** Temp-Objekt wieder löschen. Fehler hier sind egal — der Post ist schon raus. */
export async function deleteTemp(key: string): Promise<void> {
  if (!client || !BUCKET) return;
  try {
    await client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch {
    // Aufräumen ist Kür. Ein liegengebliebenes 1-MB-Objekt unter social-publish-tmp/
    // ist kein Drama; es zu behalten ist besser, als den Lauf daran scheitern zu lassen.
  }
}
