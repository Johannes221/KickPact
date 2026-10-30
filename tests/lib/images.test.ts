/**
 * Tests für `lib/storage/images.ts` — Upload-Normalisierung.
 *
 * Deckt den Logo/Bild-Upload-Bug ab (Sentry JAVASCRIPT-NEXTJS-9): iPhone-Fotos
 * kommen als HEIC/HEIF und müssen serverseitig in ein browser-darstellbares
 * Format konvertiert werden; gängige Formate laufen unverändert durch; alles
 * andere wird mit klarer Meldung abgelehnt.
 *
 * `heic-convert` ist gemockt — wir prüfen die Verzweigung, nicht die WASM-
 * Dekodierung selbst (echte HEIC-Fixtures wären schwergewichtig).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { convertMock } = vi.hoisted(() => ({ convertMock: vi.fn() }));

vi.mock("heic-convert", () => ({ default: convertMock }));

import { deflateSync } from "node:zlib";
import {
  normalizeImageUpload,
  sniffImageFormat,
  isSolidColorPng,
  MAX_IMAGE_BYTES
} from "@/lib/storage/images";

/**
 * Baut ein echtes, minimales PNG (8-bit RGB, Filter 0) — nötig, weil
 * `isSolidColorPng` die Pixel wirklich dekomprimiert (Magic-Bytes-Padding
 * genügt hier nicht). `pixel(x,y)` liefert [r,g,b].
 */
function makeRgbPng(
  width: number,
  height: number,
  pixel: (x: number, y: number) => [number, number, number]
): Buffer {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // Filter „None"
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      const p = y * (stride + 1) + 1 + x * 3;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
    }
  }
  const crcTable: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf: Buffer): number => {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const tb = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
    return Buffer.concat([len, tb, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bitDepth
  ihdr[9] = 2; // colorType RGB
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// Gültige Datei-Signaturen (Magic-Bytes) + Padding, damit der L3-Content-Sniff
// greift. Die Tests prüfen die Verzweigungslogik, nicht echte Bilddekodierung.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const HEIC_MAGIC = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from("ftypheic", "ascii")
]);
// WebP: "RIFF" + 4-Byte-Länge + "WEBP".
const WEBP_MAGIC = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP", "ascii")
]);
const fakePng = (suffix = "padding") => Buffer.concat([PNG_MAGIC, Buffer.from(suffix)]);
const fakeJpeg = (suffix = "padding") => Buffer.concat([JPEG_MAGIC, Buffer.from(suffix)]);
const fakeHeic = (suffix = "padding") => Buffer.concat([HEIC_MAGIC, Buffer.from(suffix)]);
const fakeWebp = (suffix = "padding") => Buffer.concat([WEBP_MAGIC, Buffer.from(suffix)]);

describe("normalizeImageUpload", () => {
  beforeEach(() => {
    convertMock.mockReset();
  });

  it("lässt PNG unverändert durch", async () => {
    const bytes = fakePng();
    const out = await normalizeImageUpload({
      bytes,
      contentType: "image/png",
      filename: "logo.png"
    });
    expect(out.contentType).toBe("image/png");
    expect(out.ext).toBe("png");
    expect(out.bytes).toEqual(bytes);
    expect(convertMock).not.toHaveBeenCalled();
  });

  it("normalisiert image/jpg auf image/jpeg (.jpg) ohne Konvertierung", async () => {
    const bytes = fakeJpeg();
    const out = await normalizeImageUpload({
      bytes,
      contentType: "image/jpg",
      filename: "foto.jpg"
    });
    expect(out.contentType).toBe("image/jpeg");
    expect(out.ext).toBe("jpg");
    expect(convertMock).not.toHaveBeenCalled();
  });

  it("konvertiert HEIC nach JPEG", async () => {
    const jpegOut = new Uint8Array([1, 2, 3, 4]).buffer;
    convertMock.mockResolvedValue(jpegOut);
    const out = await normalizeImageUpload({
      bytes: fakeHeic(),
      contentType: "image/heic",
      filename: "IMG_0001.HEIC"
    });
    expect(convertMock).toHaveBeenCalledTimes(1);
    expect(convertMock.mock.calls[0][0]).toMatchObject({ format: "JPEG" });
    expect(out.contentType).toBe("image/jpeg");
    expect(out.ext).toBe("jpg");
    expect(out.bytes).toEqual(Buffer.from(jpegOut));
  });

  it("erkennt HEIC an der Dateiendung, wenn der MIME-Type leer ist", async () => {
    // Mobile-Browser senden gelegentlich einen leeren `file.type`.
    const jpegOut = new Uint8Array([9, 9]).buffer;
    convertMock.mockResolvedValue(jpegOut);
    const out = await normalizeImageUpload({
      bytes: fakeHeic(),
      contentType: "",
      filename: "IMG_0002.heif"
    });
    expect(convertMock).toHaveBeenCalledTimes(1);
    expect(out.contentType).toBe("image/jpeg");
  });

  it("lehnt WebP ab — der Story-Renderer (next/og) crasht an WebP", async () => {
    // Empirisch verifiziert: next/og/resvg wirft an WebP-Bytes ('u2 is not
    // iterable') statt sie zu ignorieren. Ein akzeptiertes WebP-Logo wäre auf
    // Stories entweder unsichtbar (imageMime-Guard) oder würde das ganze Motiv
    // zerstören — also gar nicht erst annehmen.
    await expect(
      normalizeImageUpload({
        bytes: fakeWebp(),
        contentType: "image/webp",
        filename: "logo.webp"
      })
    ).rejects.toThrow(/WebP|nicht unterstützt|Format/i);
    expect(convertMock).not.toHaveBeenCalled();
  });

  it("lehnt WebP-Bytes ab, auch als .png deklariert (Sniff ist die Wahrheit)", async () => {
    // Ohne Byte-Sniff würde ein WebP mit vorgetäuschtem image/png durchrutschen
    // und als „image/png" gespeichert — die Story-Render-Falle bliebe offen.
    await expect(
      normalizeImageUpload({
        bytes: fakeWebp(),
        contentType: "image/png",
        filename: "logo.png"
      })
    ).rejects.toThrow(/WebP/i);
    expect(convertMock).not.toHaveBeenCalled();
  });

  it("lehnt nicht unterstützte Formate ab", async () => {
    await expect(
      normalizeImageUpload({
        bytes: Buffer.from("%PDF-1.7"),
        contentType: "application/pdf",
        filename: "datei.pdf"
      })
    ).rejects.toThrow(/nicht unterstützt|Format/i);
    expect(convertMock).not.toHaveBeenCalled();
  });

  it("lehnt Bytes ab, die trotz .png-Endung kein gültiges Bild sind (L3)", async () => {
    await expect(
      normalizeImageUpload({
        bytes: Buffer.from("<svg onload=alert(1)>"),
        contentType: "image/png",
        filename: "xss.png"
      })
    ).rejects.toThrow(/kein gültiges Bild/i);
    expect(convertMock).not.toHaveBeenCalled();
  });

  it("lehnt zu große Dateien ab, bevor konvertiert wird", async () => {
    const tooBig = Buffer.alloc(MAX_IMAGE_BYTES + 1);
    await expect(
      normalizeImageUpload({
        bytes: tooBig,
        contentType: "image/heic",
        filename: "riesig.heic"
      })
    ).rejects.toThrow(/groß|MB/i);
    expect(convertMock).not.toHaveBeenCalled();
  });
});

describe("sniffImageFormat (L3)", () => {
  it("erkennt PNG/JPEG/WebP/HEIC an der Signatur", () => {
    expect(sniffImageFormat(fakePng())).toBe("png");
    expect(sniffImageFormat(fakeJpeg())).toBe("jpeg");
    expect(
      sniffImageFormat(
        Buffer.concat([
          Buffer.from("RIFF"),
          Buffer.from([0, 0, 0, 0]),
          Buffer.from("WEBP")
        ])
      )
    ).toBe("webp");
    expect(sniffImageFormat(fakeHeic())).toBe("heic");
  });

  it("gibt null für Nicht-Bilder und zu kurze Buffer zurück", () => {
    expect(sniffImageFormat(Buffer.from("%PDF-1.7 not an image"))).toBeNull();
    expect(sniffImageFormat(Buffer.from("ab"))).toBeNull();
  });
});

describe("isSolidColorPng", () => {
  it("erkennt ein einfarbiges PNG (Platzhalter-Fall)", () => {
    // Der reale Fall: ein 256×256-#EA580C-Quadrat, das als Team-Logo hochgeladen
    // wurde und das echte Wappen verdeckte.
    expect(isSolidColorPng(makeRgbPng(256, 256, () => [0xea, 0x58, 0x0c]))).toBe(true);
  });

  it("erkennt auch ein kleines/1×1 einfarbiges PNG", () => {
    expect(isSolidColorPng(makeRgbPng(1, 1, () => [0, 0, 0]))).toBe(true);
    expect(isSolidColorPng(makeRgbPng(8, 8, () => [12, 34, 56]))).toBe(true);
  });

  it("lässt ein mehrfarbiges Bild durch (kein Fehlalarm)", () => {
    // Zwei-Farben-Logo, Verlauf und ein einzelnes abweichendes Pixel: alles echt.
    expect(isSolidColorPng(makeRgbPng(64, 64, (x) => (x < 32 ? [10, 20, 30] : [200, 200, 200])))).toBe(false);
    expect(isSolidColorPng(makeRgbPng(64, 64, (x, y) => [x * 3, y * 3, 128]))).toBe(false);
    expect(
      isSolidColorPng(makeRgbPng(16, 16, (x, y) => (x === 0 && y === 0 ? [1, 2, 3] : [9, 9, 9])))
    ).toBe(false);
  });

  it("gibt bei Nicht-PNG / kaputten Bytes false zurück (keine Aussage)", () => {
    expect(isSolidColorPng(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]))).toBe(false); // JPEG-Signatur
    expect(isSolidColorPng(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("short")]))).toBe(false);
    expect(isSolidColorPng(Buffer.from("not an image at all"))).toBe(false);
  });
});

describe("normalizeImageUpload — einfarbiges Logo", () => {
  it("lehnt ein solides Farbquadrat ab (Platzhalter verdeckt sonst das Wappen)", async () => {
    const solid = makeRgbPng(256, 256, () => [0xea, 0x58, 0x0c]);
    await expect(
      normalizeImageUpload({ bytes: solid, contentType: "image/png", filename: "logo.png" })
    ).rejects.toThrow(/einfarbig|echtes/i);
  });

  it("lässt ein echtes (mehrfarbiges) PNG unverändert durch", async () => {
    const real = makeRgbPng(64, 64, (x, y) => [x * 3, y * 3, 100]);
    const out = await normalizeImageUpload({
      bytes: real,
      contentType: "image/png",
      filename: "wappen.png"
    });
    expect(out.contentType).toBe("image/png");
    expect(out.bytes).toEqual(real);
  });
});
