/**
 * Tests für den CSV-Export-Endpoint `/api/exports/sponsor-charges`.
 *
 * Mocks `requireUser` + DB-Queries und prüft:
 *   - 404 wenn der User kein Sponsor-Profil hat
 *   - CSV-Body korrekt formatiert (BOM + Header + Daten + DE-Komma)
 *   - Filter-Params werden an `listChargesForSponsor` weitergegeben
 *   - Filename enthält from-to bzw. "alle"
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { requireUserMock, listChargesMock, sponsorRow } = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  listChargesMock: vi.fn(),
  sponsorRow: { id: "sp_1", displayName: "Sponsor 1" } as { id: string; displayName: string } | null
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: requireUserMock
}));

vi.mock("@/lib/db/queries/sponsor-reporting", () => ({
  listChargesForSponsor: listChargesMock
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (sponsorRow ? [sponsorRow] : [])
        })
      })
    })
  }
}));

import { GET } from "@/app/api/exports/sponsor-charges/route";

describe("/api/exports/sponsor-charges", () => {
  beforeEach(() => {
    requireUserMock.mockReset();
    listChargesMock.mockReset();
    requireUserMock.mockResolvedValue({ id: "u_1" });
  });
  afterEach(() => {
    // restore sponsor for next test
    Object.assign(sponsorRow ?? {}, { id: "sp_1", displayName: "Sponsor 1" });
  });

  it("returns 404 when user has no sponsor profile", async () => {
    // simulate no sponsor
    vi.doMock("@/lib/db/client", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => []
            })
          })
        })
      }
    }));
    // re-import the route with new mocks
    vi.resetModules();
    const mod = await import("@/app/api/exports/sponsor-charges/route");
    requireUserMock.mockResolvedValue({ id: "u_1" });

    const req = new NextRequest("http://localhost/api/exports/sponsor-charges");
    const res = await mod.GET(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("no-sponsor");
  });

  it("returns CSV with header + rows + DE-Komma + BOM", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth/session", () => ({ requireUser: requireUserMock }));
    vi.doMock("@/lib/db/queries/sponsor-reporting", () => ({
      listChargesForSponsor: listChargesMock
    }));
    vi.doMock("@/lib/db/client", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ id: "sp_1", displayName: "Sponsor 1" }]
            })
          })
        })
      }
    }));
    const mod = await import("@/app/api/exports/sponsor-charges/route");

    listChargesMock.mockResolvedValueOnce([
      {
        id: "c_1",
        createdAt: new Date("2025-09-02T10:00:00.000Z"),
        confirmedAt: new Date("2025-09-02T11:00:00.000Z"),
        amountCents: 1234,
        triggerType: "goal_total",
        status: "confirmed",
        matchId: "m_1",
        matchDate: new Date("2025-09-01T14:00:00.000Z"),
        heimName: "Heim FC",
        gastName: "Gast SV",
        ergebnisHeim: 2,
        ergebnisGast: 1,
        saison: null,
        teamId: "t_1",
        teamName: "Team 1",
        clubId: "club_a",
        clubName: "FC A",
        clubSlug: "fc-a"
      }
    ]);

    const req = new NextRequest("http://localhost/api/exports/sponsor-charges");
    const res = await mod.GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toMatch(/kickpact-charges-/);

    // BOM bleibt im Byte-Stream erhalten; `text()` würde es per Spec strippen,
    // also über `arrayBuffer()` prüfen.
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf[0]).toBe(0xef);
    expect(buf[1]).toBe(0xbb);
    expect(buf[2]).toBe(0xbf);
    const text = buf.toString("utf-8");
    // Header
    expect(text).toContain("Datum;Verein;Mannschaft");
    // Data row uses semicolon separator + DE comma decimal
    expect(text).toContain("FC A;Team 1");
    expect(text).toContain("12,34");
    expect(text).toContain("goal_total");
  });

  it("passes filter params to listChargesForSponsor", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth/session", () => ({ requireUser: requireUserMock }));
    vi.doMock("@/lib/db/queries/sponsor-reporting", () => ({
      listChargesForSponsor: listChargesMock
    }));
    vi.doMock("@/lib/db/client", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ id: "sp_1", displayName: "Sponsor 1" }]
            })
          })
        })
      }
    }));
    const mod = await import("@/app/api/exports/sponsor-charges/route");
    listChargesMock.mockResolvedValueOnce([]);

    const req = new NextRequest(
      "http://localhost/api/exports/sponsor-charges?clubId=club_a&triggerType=goal_total&status=confirmed&dateFrom=2025-09-01&dateTo=2025-09-30"
    );
    await mod.GET(req);
    expect(listChargesMock).toHaveBeenCalledOnce();
    const call = listChargesMock.mock.calls[0];
    expect(call[0]).toBe("sp_1");
    expect(call[1].filters.clubIds).toEqual(["club_a"]);
    expect(call[1].filters.triggerTypes).toEqual(["goal_total"]);
    expect(call[1].filters.statuses).toEqual(["confirmed"]);
    expect(call[1].filters.from?.toISOString()).toBe("2025-09-01T00:00:00.000Z");
    // dateTo wird +1 Tag (inklusiv-Logik) → 2025-10-01
    expect(call[1].filters.to?.toISOString()).toBe("2025-10-01T00:00:00.000Z");
  });

  it("filename uses 'alle' as from-label when no dateFrom given", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth/session", () => ({ requireUser: requireUserMock }));
    vi.doMock("@/lib/db/queries/sponsor-reporting", () => ({
      listChargesForSponsor: listChargesMock
    }));
    vi.doMock("@/lib/db/client", () => ({
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [{ id: "sp_1", displayName: "Sponsor 1" }]
            })
          })
        })
      }
    }));
    const mod = await import("@/app/api/exports/sponsor-charges/route");
    listChargesMock.mockResolvedValueOnce([]);

    const req = new NextRequest("http://localhost/api/exports/sponsor-charges");
    const res = await mod.GET(req);
    const cd = res.headers.get("Content-Disposition") ?? "";
    expect(cd).toContain("kickpact-charges-alle-");
    expect(cd).toMatch(/\.csv/);
  });
});
