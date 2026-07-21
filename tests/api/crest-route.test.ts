/**
 * Wappen-Bild-Endpoint (/api/crest): löst per team-id ODER Name auf (delegiert
 * an den geteilten getOpponentLogoUrl-Resolver), liefert die Bild-Bytes mit
 * korrektem Content-Type + aggressivem Cache-Header und fällt sonst auf 404
 * zurück — worauf TeamCrest im UI den Platzhalter zeigt.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { logoMock, bytesMock } = vi.hoisted(() => ({
  logoMock: vi.fn(),
  bytesMock: vi.fn()
}));

vi.mock("@/lib/db/queries/story", () => ({ getOpponentLogoUrl: logoMock }));
vi.mock("@/lib/storage/documents", () => ({
  readDocumentBytes: bytesMock,
  imageMime: (b: Buffer) =>
    b.subarray(0, 4).toString("hex") === "89504e47" ? "image/png" : null
}));

import { GET } from "@/app/api/crest/route";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function call(qs: string) {
  return GET(new Request(`http://localhost/api/crest${qs}`));
}

describe("/api/crest", () => {
  beforeEach(() => {
    logoMock.mockReset();
    bytesMock.mockReset();
  });

  it("löst per team-id auf → 200 + image/png + Cache-Header", async () => {
    logoMock.mockResolvedValue("r2://bucket/crest.png");
    bytesMock.mockResolvedValue(PNG);

    const res = await call("?team=123&name=SV%20Test");

    expect(logoMock).toHaveBeenCalledWith("123", "SV Test");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=86400, stale-while-revalidate=604800"
    );
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it("löst per Name auf (ohne team-id) → 200", async () => {
    logoMock.mockResolvedValue("r2://bucket/crest.png");
    bytesMock.mockResolvedValue(PNG);

    const res = await call("?name=FC%20Gegner");

    expect(logoMock).toHaveBeenCalledWith(null, "FC Gegner");
    expect(res.status).toBe(200);
  });

  it("404 wenn kein Wappen gefunden wird", async () => {
    logoMock.mockResolvedValue(null);
    const res = await call("?name=Unbekannt");
    expect(res.status).toBe(404);
    expect(bytesMock).not.toHaveBeenCalled();
  });

  it("404 ohne jeden Parameter (kein Resolver-Roundtrip)", async () => {
    const res = await call("");
    expect(res.status).toBe(404);
    expect(logoMock).not.toHaveBeenCalled();
  });

  it("404 wenn die Bytes nicht einbettbar sind (z.B. WebP → imageMime null)", async () => {
    logoMock.mockResolvedValue("r2://bucket/crest.webp");
    bytesMock.mockResolvedValue(Buffer.from([0x52, 0x49, 0x46, 0x46])); // "RIFF"
    const res = await call("?name=WebpClub");
    expect(res.status).toBe(404);
  });
});
