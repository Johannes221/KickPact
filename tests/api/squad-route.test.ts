import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// vi.hoisted() liftet die Mock-Variablen, damit vi.mock-Factories sie nutzen können.
const {
  requireUserMock,
  findInvitationByTokenMock,
  getTeamFussballdeRefMock,
  getTeamPlayerNamesMock
} = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  findInvitationByTokenMock: vi.fn(),
  getTeamFussballdeRefMock: vi.fn(),
  getTeamPlayerNamesMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: requireUserMock
}));

vi.mock("@/lib/db/queries/invitations", () => ({
  findInvitationByToken: findInvitationByTokenMock
}));

vi.mock("@/lib/db/queries/matches", () => ({
  getTeamPlayerNames: getTeamPlayerNamesMock,
  getTeamFussballdeRef: getTeamFussballdeRefMock
}));

vi.mock("@/lib/crawler/fussballde", () => ({
  getKader: vi.fn().mockResolvedValue([{ name: "Max Mustermann" }, { name: "Erika Beispiel" }])
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
  getTeamFussballdeRefMock.mockReset();
  getTeamPlayerNamesMock.mockReset();
  getTeamPlayerNamesMock.mockResolvedValue([]);
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
    getTeamFussballdeRefMock.mockResolvedValue({
      fussballdeTeamId: "ft1",
      fussballdeSlug: "fc-test"
    });
    // Aufgelaufene Spieler aus match_events — Union mit dem Kader, dedupliziert + sortiert.
    getTeamPlayerNamesMock.mockResolvedValue(["Anton Aufgelaufen", "Max Mustermann"]);

    const res = await GET(makeReq("valid-token"));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Kader {Max, Erika} ∪ match_events {Anton, Max} → dedupliziert, alphabetisch (de).
    expect(body.players).toEqual(["Anton Aufgelaufen", "Erika Beispiel", "Max Mustermann"]);
  });
});
