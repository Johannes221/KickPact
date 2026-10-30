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

import { inflateSync } from "node:zlib";

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
 * Erkennt ein EINFARBIGES (solides) PNG — ein Farbquadrat ohne jede Zeichnung.
 *
 * WARUM an der Upload-Trust-Boundary: Ein solides Quadrat ist nie ein echtes
 * Vereinswappen, sondern ein Platzhalter/Testartefakt. Als `teams.logoUrl` gilt
 * „Upload gewinnt" — ein solches Bild verdeckt damit DAUERHAFT das gescrapte
 * fussball.de-Wappen (der Crest-Fallback greift nur bei leerem/unlesbarem Logo,
 * nicht bei einem technisch gültigen PNG). Verifiziert: ein 256×256-#EA580C-
 * Quadrat (762 B, genau 1 Farbe) saß so als Logo auf einer echten Mannschaft.
 *
 * Nur PNG (das Format solcher Platzhalter): JPEG-Fotos sind nie exakt einfarbig,
 * und ein JPEG-Decoder wäre eine unnötige Dependency. Bewusst STRIKT (bricht bei
 * der ersten abweichenden Farbe ab → kein Fehlalarm bei echten Logos, die schon
 * in Zeile 0 mehrere Farben tragen) und gebounded (sehr große Bilder werden nicht
 * dekomprimiert — ein Foto ist kein Platzhalter). Nur der gängige 8-bit-Fall
 * (colorType 0/2/4/6, nicht interlaced); alles andere → „keine Aussage" (false),
 * lieber durchlassen als einen echten Upload fälschlich blocken.
 */
export function isSolidColorPng(bytes: Buffer): boolean {
  if (sniffImageFormat(bytes) !== "png") return false;
  if (bytes.length < 33) return false; // 8 Sig + 25 IHDR
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  const interlace = bytes[28];
  if (bitDepth !== 8 || interlace !== 0) return false;
  const channels =
    colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 6 ? 4 : 0;
  if (channels === 0) return false; // Palette (3) o.ä. nicht behandeln
  const px = width * height;
  if (px === 0 || px > 4_000_000) return false;

  // IDAT-Chunks einsammeln (können fragmentiert sein) und inflaten.
  let off = 8;
  const idat: Buffer[] = [];
  while (off + 8 <= bytes.length) {
    const len = bytes.readUInt32BE(off);
    const type = bytes.toString("ascii", off + 4, off + 8);
    if (type === "IEND") break;
    if (type === "IDAT") idat.push(bytes.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  if (idat.length === 0) return false;
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch {
    return false; // nicht dekodierbar → keine Aussage
  }
  const stride = width * channels;
  if (raw.length < (stride + 1) * height) return false;

  // Scanlines de-filtern (PNG-Filter 0..4) und jedes Pixel gegen das erste prüfen.
  const prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  let firstPixel: string | null = null;
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    for (let i = 0; i < stride; i++) {
      const x = raw[pos++];
      const a = i >= channels ? cur[i - channels] : 0; // links
      const b = prev[i]; // oben
      const c = i >= channels ? prev[i - channels] : 0; // oben-links
      let val: number;
      switch (filter) {
        case 0:
          val = x;
          break;
        case 1:
          val = x + a;
          break;
        case 2:
          val = x + b;
          break;
        case 3:
          val = x + ((a + b) >> 1);
          break;
        case 4:
          val = x + paethPredictor(a, b, c);
          break;
        default:
          return false; // ungültiger Filter → keine Aussage
      }
      cur[i] = val & 0xff;
    }
    for (let xp = 0; xp < width; xp++) {
      const hex = cur.subarray(xp * channels, xp * channels + channels).toString("hex");
      if (firstPixel === null) firstPixel = hex;
      else if (hex !== firstPixel) return false;
    }
    prev.set(cur);
  }
  return firstPixel !== null;
}

/** PNG-Paeth-Prädiktor (RFC-Filter Typ 4). */
function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
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

  // Einfarbiges PNG (solides Farbquadrat) ist kein echtes Wappen, sondern ein
  // Platzhalter — als teams.logoUrl verdeckt es dauerhaft das gescrapte
  // Vereinswappen (Upload gewinnt). An der Trust-Boundary abweisen (siehe
  // isSolidColorPng). Nur PNG betroffen; JPEG/HEIC laufen durch.
  if (sniffed === "png" && isSolidColorPng(input.bytes)) {
    throw new Error(
      "Das Bild ist einfarbig — bitte ein echtes Vereinswappen/Logo hochladen."
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
