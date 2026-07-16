import { beforeEach, describe, expect, it, vi } from "vitest";

const { sessionMock, coverMock, addMock, removeMock } = vi.hoisted(() => ({
  sessionMock: vi.fn(), coverMock: vi.fn(), addMock: vi.fn(), removeMock: vi.fn()
}));
vi.mock("@/lib/auth/session", () => ({ getServerSession: sessionMock }));
vi.mock("@/lib/actions/team-images", () => ({
  uploadTeamCover: coverMock, addTeamGalleryImage: addMock, removeTeamGalleryImage: removeMock
}));

import {
  UpgradeRequiredError,
  UPGRADE_REQUIRED_CODE
} from "@/lib/billing/upgrade-offer";
import { POST as coverPOST } from "@/app/api/teams/[teamId]/cover/route";
import { POST as imgPOST } from "@/app/api/teams/[teamId]/images/route";
import { DELETE as imgDELETE } from "@/app/api/teams/[teamId]/images/[imageId]/route";

function reqWithFile() {
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array([1, 2])], "x.png", { type: "image/png" }));
  return new Request("http://localhost/x", { method: "POST", body: fd });
}

describe("team-images routes", () => {
  beforeEach(() => {
    sessionMock.mockReset(); coverMock.mockReset(); addMock.mockReset(); removeMock.mockReset();
    sessionMock.mockResolvedValue({ user: { id: "u1" } });
  });

  it("cover: 401 ohne Session", async () => {
    sessionMock.mockResolvedValue(null);
    const res = await coverPOST(reqWithFile(), { params: Promise.resolve({ teamId: "t1" }) });
    expect(res.status).toBe(401);
  });

  it("cover: 200 bei Erfolg", async () => {
    coverMock.mockResolvedValue({ coverUrl: "local://k" });
    const res = await coverPOST(reqWithFile(), { params: Promise.resolve({ teamId: "t1" }) });
    expect(res.status).toBe(200);
    expect(coverMock).toHaveBeenCalled();
  });

  it("gallery: 400 mit Meldung bei Limit", async () => {
    addMock.mockRejectedValue(new Error("Maximal 8 Galerie-Bilder erlaubt."));
    const res = await imgPOST(reqWithFile(), { params: Promise.resolve({ teamId: "t1" }) });
    expect(res.status).toBe(400);
    expect((await res.json()).message).toMatch(/Maximal 8/);
  });

  // Abo-Sperre muss vom Upload-Fehler unterscheidbar sein: nur so kann der
  // Client die echte Upgrade-Aufforderung zeigen statt eines Fehler-Toasts.
  it("cover: 402 + Lock-Grund bei Abo-Sperre (statt 400 „upload-failed“)", async () => {
    coverMock.mockRejectedValue(
      new UpgradeRequiredError("expired", "Diese Mannschaft ist im Read-Only-Modus.")
    );
    const res = await coverPOST(reqWithFile(), { params: Promise.resolve({ teamId: "t1" }) });
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe(UPGRADE_REQUIRED_CODE);
    expect(body.lock).toBe("expired");
  });

  it("gallery: 402 bei Abo-Sperre", async () => {
    addMock.mockRejectedValue(
      new UpgradeRequiredError("past_due", "Diese Mannschaft ist im Read-Only-Modus.")
    );
    const res = await imgPOST(reqWithFile(), { params: Promise.resolve({ teamId: "t1" }) });
    expect(res.status).toBe(402);
    expect((await res.json()).lock).toBe("past_due");
  });

  it("gallery delete: 200", async () => {
    removeMock.mockResolvedValue(undefined);
    const res = await imgDELETE(new Request("http://x", { method: "DELETE" }), {
      params: Promise.resolve({ teamId: "t1", imageId: "i1" })
    });
    expect(res.status).toBe(200);
    expect(removeMock).toHaveBeenCalledWith({ teamId: "t1", imageId: "i1" });
  });
});
