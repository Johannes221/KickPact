/**
 * Tests für `POST /api/teams/[teamId]/logo`.
 *
 * Der Endpoint ersetzt den früheren Server-Action-Upload, der am 1-MB-
 * Bodylimit scheiterte (Sentry JAVASCRIPT-NEXTJS-9). Geprüft wird die
 * HTTP-Schicht: Auth, Datei-Handling, Erfolgs-/Fehler-Mapping. Die eigentliche
 * Validierung/Konvertierung/Storage lebt in `uploadTeamLogo` und ist gemockt.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sessionMock, uploadMock, signMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(),
  uploadMock: vi.fn(),
  signMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getServerSession: sessionMock
}));

vi.mock("@/lib/actions/team-lifecycle", () => ({
  uploadTeamLogo: uploadMock
}));

vi.mock("@/lib/storage/documents", () => ({
  getDocumentSignedUrl: signMock
}));

import { POST } from "@/app/api/teams/[teamId]/logo/route";

function makeRequest(file: File | null): Request {
  const fd = new FormData();
  if (file) fd.append("file", file);
  return new Request("http://localhost/api/teams/t1/logo", {
    method: "POST",
    body: fd
  });
}

const params = Promise.resolve({ teamId: "t1" });
const pngFile = () =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "logo.png", {
    type: "image/png"
  });

describe("POST /api/teams/[teamId]/logo", () => {
  beforeEach(() => {
    sessionMock.mockReset();
    uploadMock.mockReset();
    signMock.mockReset();
    sessionMock.mockResolvedValue({ user: { id: "u1" } });
    signMock.mockImplementation(async (k: string) => `signed:${k}`);
  });

  it("401 ohne Session", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await POST(makeRequest(pngFile()), { params });
    expect(res.status).toBe(401);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("400 ohne Datei", async () => {
    const res = await POST(makeRequest(null), { params });
    expect(res.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("200 + signierte logoUrl bei Erfolg", async () => {
    uploadMock.mockResolvedValue({ logoUrl: "r2://bucket/teams/t1/logo-x.jpg" });
    const res = await POST(makeRequest(pngFile()), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.logoUrl).toBe("signed:r2://bucket/teams/t1/logo-x.jpg");
    expect(uploadMock).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: "t1", filename: "logo.png", contentType: "image/png" })
    );
  });

  it("400 mit Meldung bei Validierungsfehler", async () => {
    uploadMock.mockRejectedValue(new Error("Format „image/svg+xml\" wird nicht unterstützt"));
    const res = await POST(makeRequest(pngFile()), { params });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/nicht unterstützt/);
  });

  it("403 wenn Auth (assertClubWriteAccess) redirectet", async () => {
    const redirectErr = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/dashboard;307;"
    });
    uploadMock.mockRejectedValue(redirectErr);
    const res = await POST(makeRequest(pngFile()), { params });
    expect(res.status).toBe(403);
  });
});
