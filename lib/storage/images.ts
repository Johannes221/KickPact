/**
 * Upload-Normalisierung für Bilder (Logos, Vereinsbilder).
 *
 * Warum: iPhones liefern Fotos standardmäßig als HEIC/HEIF — ein Format, das
 * Browser nicht in `<img>` rendern. Dazu schicken mobile Browser gelegentlich
 * einen leeren `file.type`. Diese Funktion bringt jeden akzeptierten Upload in
 * ein garantiert darstellbares Format (PNG/JPEG) und liefert die passende
 * Datei-Endung für den Storage-Key.
 *
 * WebP wird bewusst NICHT akzeptiert (auch wenn Browser es rendern): der
 * Story-Renderer next/og (Satori/resvg) WIRFT an WebP-Bytes — empirisch
 * verifiziert, nicht bloß „kann es nicht". Ein gespeichertes WebP-Logo wäre auf
 * geteilten Stories entweder unsichtbar oder würde das ganze Motiv sprengen.
 * Darum an der Upload-Trust-Boundary rausfiltern, damit „gespeichertes Logo ist
 * überall renderbar" eine echte Invariante bleibt. Siehe lib/story/story-data.ts.
 *
 * Die HEIC-Dekodierung läuft über `heic-convert` (reines JS + WASM, keine
 * nativen Build-Abhängigkeiten → funktioniert im Playwright-Docker-Image). Das
 * Modul wird lazy per dynamischem Import geladen, damit der WASM-Blob nur dann
 * in den Speicher kommt, wenn wirklich ein HEIC hochgeladen wird.
 */

/** Eingangsformate, die wir akzeptieren (vor Konvertierung). WebP fehlt bewusst
 *  — der Story-Renderer verträgt es nicht (siehe Modul-Doc). */
export const ALLOWED_INPUT_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/heic",
  "image/heif"
]);

/** Max. Upload-Größe (vor Konvertierung). Route-Handler statt Server-Action →
 *  nicht durch das 1-MB-Server-Action-Bodylimit gedeckelt. */
export const MAX_IMAGE_BYTES = 10_000_000; // 10 MB

export type OutputMime = "image/png" | "image/jpeg";
export type OutputExt = "png" | "jpg";

export interface NormalizedImage {
  bytes: Buffer;
  contentType: OutputMime;
  ext: OutputExt;
}

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  heic: "image/heic",
  heif: "image/heif"
};

const MIME_TO_OUTPUT: Record<string, NormalizedImage["contentType"]> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg"
};

const OUTPUT_EXT: Record<OutputMime, OutputExt> = {
  "image/png": "png",
  "image/jpeg": "jpg"
};

/**
 * Bestimmt den effektiven MIME-Type: bevorzugt den gemeldeten `contentType`,
 * fällt aber auf die Dateiendung zurück (leerer/abweichender Type von Mobile).
 * `image/jpg` (non-standard) wird auf `image/jpeg` normalisiert.
 */
function resolveInputMime(contentType: string, filename: string): string | null {
  const ct = contentType.trim().toLowerCase();
  const normalized = ct === "image/jpg" ? "image/jpeg" : ct;
  if (ALLOWED_INPUT_MIME.has(normalized)) return normalized;

  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const fromExt = EXT_TO_MIME[ext];
  if (fromExt && ALLOWED_INPUT_MIME.has(fromExt)) return fromExt;

  return null;
}

/**
 * SECURITY (L3): Content-Sniffing über Magic-Bytes. Der gemeldete MIME-Type /
 * die Dateiendung sind angreifer-kontrolliert — ein Angreifer könnte beliebige
 * Bytes als `foo.png` deklarieren. Wir prüfen die echte Datei-Signatur und
 * akzeptieren nur die unterstützten Bildformate. Verhindert das Ablegen von
 * Müll-/Polyglot-Dateien (Stored-XSS ist bereits durch den erzwungenen
 * Content-Type beim Ausliefern gemildert, dies ist Defense-in-depth).
 */
export function sniffImageFormat(
  bytes: Buffer
): "png" | "jpeg" | "webp" | "heic" | null {
  if (bytes.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
    bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a &&
    bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "png";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  // WebP: "RIFF"...."WEBP"
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  // HEIC/HEIF: ISO-BMFF "ftyp" box at offset 4, brand at offset 8.
  if (bytes.toString("ascii", 4, 8) === "ftyp") {
    const brand = bytes.toString("ascii", 8, 12).toLowerCase();
    if (["heic", "heix", "heif", "mif1", "msf1", "hevc", "hevx"].includes(brand)) {
      return "heic";
    }
  }
  return null;
}

/**
 * Validiert + normalisiert einen Bild-Upload. Wirft mit nutzerlesbarer Meldung
 * bei nicht unterstütztem Format oder Überschreitung der Größengrenze.
 */
export async function normalizeImageUpload(input: {
  bytes: Buffer;
  contentType: string;
  filename: string;
}): Promise<NormalizedImage> {
  const mime = resolveInputMime(input.contentType, input.filename);
  if (!mime) {
    throw new Error(
      `Format „${input.contentType || "unbekannt"}" wird nicht unterstützt — erlaubt sind PNG, JPEG oder HEIC/HEIF (iPhone).`
    );
  }

  // Größe IMMER auf dem Eingangs-Buffer prüfen (vor der teuren Konvertierung
  // und vor dem Signatur-Check, damit ein Multi-MB-Müllblob direkt rausfliegt).
  if (input.bytes.byteLength > MAX_IMAGE_BYTES) {
    const mb = (input.bytes.byteLength / 1_000_000).toFixed(1);
    const maxMb = (MAX_IMAGE_BYTES / 1_000_000).toFixed(0);
    throw new Error(`Bild zu groß (${mb} MB) — max. ${maxMb} MB erlaubt.`);
  }

  // SECURITY (L3): Echte Datei-Signatur prüfen — nicht dem gemeldeten Type
  // vertrauen. Eine Datei, deren Bytes kein bekanntes Bildformat sind, wird
  // abgelehnt (auch wenn Endung/MIME „.png" behaupten).
  const sniffed = sniffImageFormat(input.bytes);
  if (sniffed === null) {
    throw new Error(
      "Die Datei ist kein gültiges Bild (PNG, JPEG oder HEIC/HEIF)."
    );
  }

  // WebP hier hart ablehnen — anhand der ECHTEN Bytes, nicht des gemeldeten
  // Typs: ein WebP mit vorgetäuschtem `image/png` käme sonst durch `mime` durch
  // und würde als „image/png" mit WebP-Bytes gespeichert → auf Stories crasht
  // next/og daran. Der Sniff ist die Wahrheit (siehe Modul-Doc).
  if (sniffed === "webp") {
    throw new Error(
      "WebP wird nicht unterstützt — bitte als PNG oder JPEG hochladen (iPhone-HEIC ist ok)."
    );
  }

  if (mime === "image/heic" || mime === "image/heif") {
    const convert = (await import("heic-convert")).default;
    const out = await convert({
      buffer: input.bytes,
      format: "JPEG",
      quality: 0.9
    });
    return {
      bytes: Buffer.from(out),
      contentType: "image/jpeg",
      ext: "jpg"
    };
  }

  const contentType = MIME_TO_OUTPUT[mime];
  return {
    bytes: input.bytes,
    contentType,
    ext: OUTPUT_EXT[contentType]
  };
}
