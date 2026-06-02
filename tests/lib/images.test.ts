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

import {
  normalizeImageUpload,
  sniffImageFormat,
  MAX_IMAGE_BYTES
} from "@/lib/storage/images";

// Gültige Datei-Signaturen (Magic-Bytes) + Padding, damit der L3-Content-Sniff
// greift. Die Tests prüfen die Verzweigungslogik, nicht echte Bilddekodierung.
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const HEIC_MAGIC = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from("ftypheic", "ascii")
]);
const fakePng = (suffix = "padding") => Buffer.concat([PNG_MAGIC, Buffer.from(suffix)]);
const fakeJpeg = (suffix = "padding") => Buffer.concat([JPEG_MAGIC, Buffer.from(suffix)]);
const fakeHeic = (suffix = "padding") => Buffer.concat([HEIC_MAGIC, Buffer.from(suffix)]);

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
