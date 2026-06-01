import { beforeEach, describe, expect, it, vi } from "vitest";

const { coverKeyMock, galleryKeyMock, signMock, readMock } = vi.hoisted(() => ({
  coverKeyMock: vi.fn(), galleryKeyMock: vi.fn(), signMock: vi.fn(), readMock: vi.fn()
}));
vi.mock("@/lib/db/client", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => coverKeyMock() }) }) }) }
}));
vi.mock("@/lib/db/queries/team-images", () => ({ getTeamImageKey: galleryKeyMock }));
vi.mock("@/lib/storage/documents", () => ({
  getDocumentSignedUrl: signMock, readLocalDocument: readMock
}));

import { GET } from "@/app/api/teams/[teamId]/image/route";

function req(qs: string) { return new Request(`http://localhost/api/teams/t1/image?${qs}`); }

describe("team image serve", () => {
  beforeEach(() => { coverKeyMock.mockReset(); galleryKeyMock.mockReset(); signMock.mockReset(); readMock.mockReset(); });

  it("404 für unbekannten slot", async () => {
    const res = await GET(req("slot=bogus"), { params: Promise.resolve({ teamId: "t1" }) });
    expect(res.status).toBe(404);
  });

  it("lehnt Keys außerhalb teams/<teamId>/ ab (kein Doc-Leak)", async () => {
    coverKeyMock.mockResolvedValue([{ coverUrl: "r2://bucket/verifications/secret.pdf" }]);
    const res = await GET(req("slot=cover"), { params: Promise.resolve({ teamId: "t1" }) });
    expect(res.status).toBe(404);
    expect(signMock).not.toHaveBeenCalled();
  });

  it("R2-Cover → 302 Redirect auf signierte URL", async () => {
    coverKeyMock.mockResolvedValue([{ coverUrl: "r2://bucket/teams/t1/cover-x.jpg" }]);
    signMock.mockResolvedValue("https://signed.example/x");
    const res = await GET(req("slot=cover"), { params: Promise.resolve({ teamId: "t1" }) });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://signed.example/x");
  });

  it("lokaler Key (Unterstrich-Format) wird gestreamt, nicht 404", async () => {
    // storeDocument ersetzt bei lokalem Storage Slashes durch Unterstriche:
    // teams/t1/cover-x.jpg -> local://teams_t1_cover-x.jpg
    coverKeyMock.mockResolvedValue([{ coverUrl: "local://teams_t1_cover-x.jpg" }]);
    readMock.mockResolvedValue(Buffer.from([0xff, 0xd8, 0xff]));
    const res = await GET(req("slot=cover"), { params: Promise.resolve({ teamId: "t1" }) });
    expect(res.status).toBe(200);
    expect(readMock).toHaveBeenCalledWith("teams_t1_cover-x.jpg");
  });

  it("lehnt fremdes lokales Team ab (teams_<otherId>_)", async () => {
    coverKeyMock.mockResolvedValue([{ coverUrl: "local://teams_other_cover.jpg" }]);
    const res = await GET(req("slot=cover"), { params: Promise.resolve({ teamId: "t1" }) });
    expect(res.status).toBe(404);
    expect(readMock).not.toHaveBeenCalled();
  });
});
