/**
 * Tests für `GET /api/user/avatar`.
 *
 * Hintergrund: Die App-Shell (Header-User-Menü) fragt die Route auf jedem
 * Seitenladen an. Für User ohne servierbares Bild antwortete sie 404/410 →
 * permanentes 4xx-Rauschen im Netzwerk-Log. Außerdem: OAuth-Signups (Google/
 * Apple) haben in `users.image` eine externe https-URL, die die Route als
 * lokalen Pfad fehlinterpretierte (→ 410 statt Bild).
 *
 * Erwartung jetzt: externe URLs → Redirect, kein/fehlendes Bild → 204.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sessionMock, keyMock, signMock, readMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(),
  keyMock: vi.fn(),
  signMock: vi.fn(),
  readMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getServerSession: sessionMock
}));

vi.mock("@/lib/actions/user-avatar", () => ({
  getUserAvatarKey: keyMock,
  uploadUserAvatar: vi.fn()
}));

vi.mock("@/lib/storage/documents", () => ({
  getDocumentSignedUrl: signMock,
  readLocalDocument: readMock
}));

import { GET } from "@/app/api/user/avatar/route";

describe("GET /api/user/avatar", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    keyMock.mockReset();
    signMock.mockReset();
    readMock.mockReset();
    sessionMock.mockResolvedValue({ user: { id: "u1" } });
    signMock.mockImplementation(async (k: string) => `https://signed.example/${encodeURIComponent(k)}`);
  });

  it("401 ohne Session", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(keyMock).not.toHaveBeenCalled();
  });

  it("204 (kein Body) wenn kein Avatar gesetzt ist — kein 4xx-Rauschen in der Shell", async () => {
    keyMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(204);
  });

  it("Redirect auf externe URL bei OAuth-Avatar (https://…)", async () => {
    keyMock.mockResolvedValue("https://lh3.googleusercontent.com/a/abc123");
    const res = await GET();
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("location")).toBe("https://lh3.googleusercontent.com/a/abc123");
    expect(readMock).not.toHaveBeenCalled();
  });

  it("Redirect auf signierte URL bei r2://-Key", async () => {
    keyMock.mockResolvedValue("r2://bucket/users/u1/avatar-x.jpg");
    const res = await GET();
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(res.headers.get("location")).toContain("signed.example");
  });

  it("200 + Bytes bei vorhandener lokaler Datei", async () => {
    keyMock.mockResolvedValue("local://users/u1/avatar-x.png");
    readMock.mockResolvedValue(Buffer.from([1, 2, 3]));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(readMock).toHaveBeenCalledWith("users/u1/avatar-x.png");
  });

  it("204 statt 410 wenn die lokale Datei fehlt (z.B. nach Redeploy)", async () => {
    keyMock.mockResolvedValue("local://users/u1/avatar-x.jpg");
    readMock.mockRejectedValue(new Error("ENOENT"));
    const res = await GET();
    expect(res.status).toBe(204);
  });
});
