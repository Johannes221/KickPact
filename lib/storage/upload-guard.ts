import { NextResponse } from "next/server";
import { MAX_IMAGE_BYTES } from "./images";

/**
 * Obergrenze für den gesamten Request-Body eines Bild-Uploads: die maximale
 * Bildgröße plus Headroom für Multipart-/Feld-Overhead.
 */
export const MAX_UPLOAD_REQUEST_BYTES = MAX_IMAGE_BYTES + 2_000_000; // ~12 MB

/**
 * SECURITY (M3): Früh-Abbruch über den `Content-Length`-Header, BEVOR der Body
 * mit `req.formData()` / `arrayBuffer()` komplett in den RAM gelesen wird. Die
 * Upload-Routen deaktivieren bewusst das Next-Bodylimit; ohne diese Prüfung
 * könnte ein authentifizierter Nutzer einen Multi-GB-Body schicken und den
 * Server-Speicher erschöpfen (DoS). Liefert eine 413-Response wenn zu groß,
 * sonst `null` (weiter im Handler).
 */
export function rejectOversizedUpload(req: Request): NextResponse | null {
  const header = req.headers.get("content-length");
  if (!header) return null; // chunked/unbekannt → die spätere Byte-Prüfung greift
  const length = Number(header);
  if (Number.isFinite(length) && length > MAX_UPLOAD_REQUEST_BYTES) {
    const mb = (length / 1_000_000).toFixed(1);
    const maxMb = (MAX_UPLOAD_REQUEST_BYTES / 1_000_000).toFixed(0);
    return NextResponse.json(
      { error: "payload-too-large", message: `Upload zu groß (${mb} MB) — max. ${maxMb} MB erlaubt.` },
      { status: 413 }
    );
  }
  return null;
}
