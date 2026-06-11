/**
 * Phase 4 / Paket B — Onboarding-Mannschaftssuche.
 *
 * B1a: Coverage-none-Mannschaften (E-/F-/G-Jugend, Bambini) werden NICHT mehr
 *      still herausgefiltert, sondern mit `dataCoverage`-Flag zurückgegeben,
 *      damit die UI den Hinweis „keine automatischen Spieldaten" zeigen kann.
 *      Anlegbar bleiben sie.
 * B2:  Check A (Spec 2026-05-29 §4) — hat der reale Verein bereits eine aktive
 *      Vereinslizenz auf KickPact, liefert die Action das `licensedVerein`-Flag
 *      für die Hinweis-Karte „Beitritt unter Vereinslizenz anfragen".
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getServerSession: vi.fn().mockResolvedValue({
    user: { id: "u_search", email: "search@example.com" }
  })
}));

// Crawler komplett mocken — kein Playwright/Netz im Test. dedupeMannschaften
// wird als simple Pass-Through-Implementierung ersetzt (Dedupe-Logik hat
// eigene Tests im Crawler-Bereich).
const getMannschaftenMock = vi.fn();
vi.mock("@/lib/crawler/fussballde", () => ({
  searchVereine: vi.fn(),
  getMannschaften: (...args: unknown[]) => getMannschaftenMock(...args),
  dedupeMannschaften: <T,>(teams: T[]) => teams
}));

import { users, clubs, teams } from "@/lib/db/schema";
import { subscriptions, teamLicenses } from "@/lib/db/schema/billing";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import { getMannschaftenAction } from "@/app/(onboarding)/onboarding/verein/_actions/search";

function crawledTeam(name: string, teamId: string) {
  return {
    name,
    slug: "test-fc",
    saison: "2526",
    teamId,
    url: `https://example.invalid/${teamId}`
  };
}

describe.skipIf(isIntegrationDbDisabled)("getMannschaftenAction", () => {
  beforeEach(async () => {
    await resetTestDb();
    getMannschaftenMock.mockReset();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("B1a: zeigt Coverage-none-Teams (E-Jugend) statt sie still zu filtern — mit dataCoverage-Flag", async () => {
    getMannschaftenMock.mockResolvedValue([
      crawledTeam("Herren - Test FC", "T_HERREN"),
      crawledTeam("E-Junioren - Test FC", "T_EJUGEND"),
      crawledTeam("D-Junioren - Test FC", "T_DJUGEND")
    ]);

    const res = await getMannschaftenAction({
      vereinId: "V1",
      slug: "test-fc",
      vereinName: "Test FC"
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.results).toHaveLength(3);

    const byId = new Map(res.results.map((r) => [r.teamId, r]));
    expect(byId.get("T_HERREN")?.dataCoverage).toBe("full");
    expect(byId.get("T_DJUGEND")?.dataCoverage).toBe("results_only");
    // Vorher wurde dieses Team komplett verschluckt:
    expect(byId.get("T_EJUGEND")).toBeDefined();
    expect(byId.get("T_EJUGEND")?.dataCoverage).toBe("none");
    expect(byId.get("T_EJUGEND")?.isLocked).toBe(false);
  });

  it("B2: liefert licensedVerein-Flag, wenn der reale Verein bereits eine aktive Vereinslizenz hat", async () => {
    const db = await getTestDb();
    await db.insert(users).values({ id: "u_lic", email: "lic@example.com" });
    await db.insert(clubs).values({
      id: "c_lic",
      slug: "lizenz-sv",
      name: "Lizenz SV",
      fussballdeVereinId: "V_LIC",
      onboardingStatus: "completed"
    });
    const [team] = await db
      .insert(teams)
      .values({
        clubId: "c_lic",
        name: "1. Herren",
        saison: "2526",
        fussballdeTeamId: "T_LIC_1",
        fussballdeSlug: "lizenz-sv-1",
        isActive: true
      })
      .returning();
    await db.insert(subscriptions).values({ clubId: "c_lic", status: "active" });
    await db.insert(teamLicenses).values({
      subscriptionClubId: "c_lic",
      teamId: team.id,
      plan: "verein",
      status: "active"
    });

    getMannschaftenMock.mockResolvedValue([
      crawledTeam("2. Herren - Lizenz SV", "T_LIC_2")
    ]);

    const res = await getMannschaftenAction({
      vereinId: "V_LIC",
      slug: "lizenz-sv",
      vereinName: "Lizenz SV"
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.licensedVerein).toEqual({
      clubId: "c_lic",
      clubSlug: "lizenz-sv",
      clubName: "Lizenz SV"
    });
  });

  it("B2 Gegenrichtung: ohne Vereinslizenz bleibt licensedVerein null", async () => {
    getMannschaftenMock.mockResolvedValue([
      crawledTeam("Herren - Test FC", "T_HERREN")
    ]);

    const res = await getMannschaftenAction({
      vereinId: "V_OHNE",
      slug: "test-fc",
      vereinName: "Test FC"
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.licensedVerein).toBeNull();
  });
});
