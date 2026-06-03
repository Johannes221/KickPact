import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// vi.hoisted() liftet die Mock-Variablen, damit vi.mock-Factories sie nutzen können.
const {
  requireUserMock,
  findInvitationByTokenMock,
  getTeamPlayerPoolMock
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  findInvitationByTokenMock: vi.fn(),
  getTeamPlayerPoolMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: requireUserMock
}));

vi.mock("@/lib/db/queries/invitations", () => ({
  findInvitationByToken: findInvitationByTokenMock
}));

vi.mock("@/lib/db/queries/matches", () => ({
  getTeamPlayerPool: getTeamPlayerPoolMock
}));

import { GET } from "@/app/api/squad/route";

function makeReq(token?: string): NextRequest {
  const url = token
    ? `http://localhost/api/squad?invitationToken=${token}`
    : `http://localhost/api/squad`;
  return new NextRequest(url);
}

beforeEach(() => {
  requireUserMock.mockReset();
  findInvitationByTokenMock.mockReset();
  getTeamPlayerPoolMock.mockReset();
  getTeamPlayerPoolMock.mockResolvedValue([]);
});

describe("GET /api/squad", () => {
  it("erfordert einen authentifizierten User", async () => {
    requireUserMock.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(GET(makeReq("tok-1"))).rejects.toThrow();
  });

  it("liefert 400 wenn invitationToken fehlt", async () => {
    requireUserMock.mockResolvedValue({ id: "u1", email: "s@e.de" });
    const res = await GET(makeReq());
    expect(res.status).toBe(400);
  });

  it("liefert 410 wenn Invitation nicht (mehr) pending ist", async () => {
    // findInvitationByToken returnt NULL für used/expired/revoked
    requireUserMock.mockResolvedValue({ id: "u1", email: "s@e.de" });
    findInvitationByTokenMock.mockResolvedValue(null);

    const res = await GET(makeReq("expired-or-used-token"));
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error).toMatch(/invitation/i);
  });

  it("liefert Spielerliste bei gültiger pending Invitation", async () => {
    requireUserMock.mockResolvedValue({ id: "u1", email: "s@e.de" });
    findInvitationByTokenMock.mockResolvedValue({
      id: "inv1",
      teamId: "team1",
      status: "pending"
    });
    // /api/squad zieht die Liste jetzt rein aus der DB (Kader ∪ Auftritte) via
    // getTeamPlayerPool — kein Live-Scrape mehr. Dedup/Sort passiert dort.
    getTeamPlayerPoolMock.mockResolvedValue([
      "Anton Aufgelaufen",
      "Erika Beispiel",
      "Max Mustermann"
    ]);

    const res = await GET(makeReq("valid-token"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(getTeamPlayerPoolMock).toHaveBeenCalledWith("team1");
    expect(body.players).toEqual(["Anton Aufgelaufen", "Erika Beispiel", "Max Mustermann"]);
  });
});
