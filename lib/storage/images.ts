/**
 * Upload-Normalisierung für Bilder (Logos, Vereinsbilder).
 *
 * Warum: iPhones liefern Fotos standardmäßig als HEIC/HEIF — ein Format, das
 * Browser nicht in `<img>` rendern. Dazu schicken mobile Browser gelegentlich
 * einen leeren `file.type`. Diese Funktion bringt jeden akzeptierten Upload in
 * ein garantiert darstellbares Format (PNG/JPEG/WebP) und liefert die passende
 * Datei-Endung für den Storage-Key.
 *
 * Die HEIC-Dekodierung läuft über `heic-convert` (reines JS + WASM, keine
 * nativen Build-Abhängigkeiten → funktioniert im Playwright-Docker-Image). Das
 * Modul wird lazy per dynamischem Import geladen, damit der WASM-Blob nur dann
 * in den Speicher kommt, wenn wirklich ein HEIC hochgeladen wird.
 */

/** Eingangsformate, die wir akzeptieren (vor Konvertierung). */
export const ALLOWED_INPUT_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif"
]);

/** Max. Upload-Größe (vor Konvertierung). Route-Handler statt Server-Action →
 *  nicht durch das 1-MB-Server-Action-Bodylimit gedeckelt. */
export const MAX_IMAGE_BYTES = 10_000_000; // 10 MB

export type OutputMime = "image/png" | "image/jpeg" | "image/webp";
export type OutputExt = "png" | "jpg" | "webp";

export interface NormalizedImage {
  bytes: Buffer;
  contentType: OutputMime;
  ext: OutputExt;
}

const EXT_TO_MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif"
};

const MIME_TO_OUTPUT: Record<string, NormalizedImage["contentType"]> = {
  "image/png": "image/png",
  "image/jpeg": "image/jpeg",
  "image/webp": "image/webp"
};

const OUTPUT_EXT: Record<OutputMime, OutputExt> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp"
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
      `Format „${input.contentType || "unbekannt"}" wird nicht unterstützt — erlaubt sind PNG, JPEG, WebP oder HEIC/HEIF (iPhone).`
    );
  }

  // Größe IMMER auf dem Eingangs-Buffer prüfen (vor der teuren Konvertierung).
  if (input.bytes.byteLength > MAX_IMAGE_BYTES) {
    const mb = (input.bytes.byteLength / 1_000_000).toFixed(1);
    const maxMb = (MAX_IMAGE_BYTES / 1_000_000).toFixed(0);
    throw new Error(`Bild zu groß (${mb} MB) — max. ${maxMb} MB erlaubt.`);
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
