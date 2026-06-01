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
  MAX_IMAGE_BYTES
} from "@/lib/storage/images";

describe("normalizeImageUpload", () => {
  beforeEach(() => {
    convertMock.mockReset();
  });

  it("lässt PNG unverändert durch", async () => {
    const bytes = Buffer.from("fake-png");
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
    const bytes = Buffer.from("fake-jpeg");
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
      bytes: Buffer.from("fake-heic"),
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
      bytes: Buffer.from("fake-heic"),
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
