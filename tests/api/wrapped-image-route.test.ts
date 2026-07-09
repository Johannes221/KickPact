/**
 * Smoke-Test der Wrapped-Share-Bild-Route (W4):
 * /api/teams/[teamId]/wrapped-image/[slide] liefert 200 + image/png für
 * gültige Slide-Keys, 404 für unbekannte/datenlose Slides, 403 ohne Zugriff.
 * Auth/Stats sind gemockt — gerendert wird ECHT via next/og (ImageResponse).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WrappedStats } from "@/lib/db/queries/wrapped";

const { requireUserMock, resolveTeamAccessMock, statsMock, prevSaisonMock, standingsMock } =
  vi.hoisted(() => ({
    requireUserMock: vi.fn(),
    resolveTeamAccessMock: vi.fn(),
    statsMock: vi.fn(),
    prevSaisonMock: vi.fn(),
    standingsMock: vi.fn()
  }));

vi.mock("@/lib/auth/session", () => ({ requireUser: requireUserMock }));
vi.mock("@/lib/auth/scope", () => ({ resolveTeamAccess: resolveTeamAccessMock }));
vi.mock("@/lib/db/queries/wrapped", () => ({
  getWrappedStatsForPrevSeason: statsMock,
  getPrevSaisonForTeam: prevSaisonMock,
  WRAPPED_MIN_MATCHES: 3
}));
vi.mock("@/lib/recap/standings-cache", () => ({
  getCachedStandings: standingsMock,
  getCachedStandingsForRequest: standingsMock
}));

import { GET } from "@/app/api/teams/[teamId]/wrapped-image/[slide]/route";

const FULL_STATS: WrappedStats = {
  teamName: "1. Herren",
  saison: "2526",
  spiele: 6,
  siege: 4,
  unentschieden: 1,
  niederlagen: 1,
  toreGeschossen: 16,
  toreKassiert: 8,
  besterTorschuetze: { name: "Max Müller", tore: 3 },
  zuNull: 2,
  comebacks: 1,
  heimsiege: 3,
  auswaertssiege: 1,
  hoechsterSieg: { heimName: "Testkirchen", gastName: "Gegner F", ergebnis: "6:0" },
  pactsCount: 1,
  beitraegeSummeCents: 900,
  simulationFallbackCents: null,
  tabellenplatz: 6,
  teamsInLeague: 14,
  punkte: 42,
  aggregateSource: "table",
  detailMatchCount: 6,
  vsTop3: { spiele: 2, siege: 0, unentschieden: 0, niederlagen: 2 },
  ligaTorschuetze: { name: "Sasa Sprecakovic", tore: 29, ligaPlatz: 1 },
  fairness: { platz: 12, teamsInLeague: 13, gelb: 51, rot: 5, quote: 2.91 }
};

function call(slide: string) {
  return GET(new Request(`http://localhost/api/teams/t1/wrapped-image/${slide}`), {
    params: Promise.resolve({ teamId: "t1", slide })
  });
}

describe("wrapped-image route", () => {
  beforeEach(() => {
    requireUserMock.mockReset().mockResolvedValue({ id: "u1" });
    resolveTeamAccessMock.mockReset().mockResolvedValue({ granted: true });
    statsMock.mockReset().mockResolvedValue(FULL_STATS);
    prevSaisonMock.mockReset().mockResolvedValue("2425");
    standingsMock.mockReset().mockResolvedValue(null);
  });

  it.each(["tore", "bilanz", "ligatorschuetze", "fairness"])(
    "%s → 200 + image/png",
    async (slide) => {
      const res = await call(slide);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("image/png");
      const buf = Buffer.from(await res.arrayBuffer());
      // PNG-Magic-Bytes
      expect(buf.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    }
  );

  it("404 für ligatorschuetze/fairness ohne Liga-Daten", async () => {
    statsMock.mockResolvedValue({ ...FULL_STATS, ligaTorschuetze: null, fairness: null });
    expect((await call("ligatorschuetze")).status).toBe(404);
    expect((await call("fairness")).status).toBe(404);
  });

  it("404 für unbekannte Slide-Keys (kein Auth-Roundtrip)", async () => {
    const res = await call("bogus");
    expect(res.status).toBe(404);
    expect(requireUserMock).not.toHaveBeenCalled();
  });

  it("403 ohne Team-Zugriff", async () => {
    resolveTeamAccessMock.mockResolvedValue({ granted: false });
    const res = await call("tore");
    expect(res.status).toBe(403);
  });

  it("404 für datenlose Slides (kein Torschütze)", async () => {
    statsMock.mockResolvedValue({ ...FULL_STATS, besterTorschuetze: null });
    const res = await call("torschuetze");
    expect(res.status).toBe(404);
  });

  it("404 unter der Mindest-Spielzahl", async () => {
    statsMock.mockResolvedValue({ ...FULL_STATS, spiele: 2 });
    const res = await call("tore");
    expect(res.status).toBe(404);
  });
});
