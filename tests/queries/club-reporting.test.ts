/**
 * Integration tests für `lib/db/queries/club-reporting.ts`.
 *
 * Seedet einen Mini-Verein mit zwei Teams, zwei Sponsoren, ein paar Pledges
 * + Charges und prüft Filter/Pagination/Sort sowie Sponsor-Overview-Aggregate.
 *
 * Gated wie `paginate.test.ts` via `isIntegrationDbDisabled`.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  clubs,
  teams,
  users,
  sponsors,
  pledges,
  pledgeRules,
  matches,
  charges
} from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import {
  listChargesForClub,
  listPledgesForClub,
  getSponsorOverviewForClub,
  getVereinDashboardKpis
} from "@/lib/db/queries/club-reporting";

describe.skipIf(isIntegrationDbDisabled)("club-reporting (integration)", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seed();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  // ─── listChargesForClub ────────────────────────────────────────────────────

  it("listChargesForClub: ohne opts liefert ALLE Rows als Array", async () => {
    const rows = await listChargesForClub("club_a");
    expect(Array.isArray(rows)).toBe(true);
    // 4 confirmed charges (team-1: 2, team-2: 2)
    expect(rows.length).toBe(4);
  });

  it("listChargesForClub: paginiert", async () => {
    const result = await listChargesForClub("club_a", {
      pagination: { page: 1, pageSize: 2 }
    });
    expect(result.total).toBe(4);
    expect(result.totalPages).toBe(2);
    expect(result.rows.length).toBe(2);
  });

  it("listChargesForClub: filter teamId", async () => {
    const result = await listChargesForClub("club_a", {
      pagination: { page: 1, pageSize: 10 },
      filter: { teamId: "team_1" }
    });
    expect(result.total).toBe(2);
    expect(result.rows.every((r) => r.teamId === "team_1")).toBe(true);
  });

  it("listChargesForClub: filter sponsorId", async () => {
    const result = await listChargesForClub("club_a", {
      pagination: { page: 1, pageSize: 10 },
      filter: { sponsorId: "sp_1" }
    });
    expect(result.total).toBe(2);
    expect(result.rows.every((r) => r.sponsorId === "sp_1")).toBe(true);
  });

  it("listChargesForClub: filter status", async () => {
    const result = await listChargesForClub("club_a", {
      pagination: { page: 1, pageSize: 10 },
      filter: { status: "confirmed" }
    });
    expect(result.total).toBe(4);
  });

  it("listChargesForClub: ohne pagination + sponsorId-filter funktioniert für CSV-Export", async () => {
    const rows = await listChargesForClub("club_a", {
      filter: { sponsorId: "sp_1" }
    });
    expect(rows.length).toBe(2);
  });

  it("listChargesForClub: sort by amountCents asc", async () => {
    const result = await listChargesForClub("club_a", {
      pagination: { page: 1, pageSize: 10 },
      sort: "amountCents",
      dir: "asc"
    });
    const amounts = result.rows.map((r) => r.amountCents);
    expect(amounts).toEqual([...amounts].sort((a, b) => a - b));
  });

  it("listChargesForClub: scoped per club — fremder Club leakt nicht", async () => {
    const result = await listChargesForClub("club_b", {
      pagination: { page: 1, pageSize: 10 }
    });
    expect(result.total).toBe(0);
  });

  // ─── listPledgesForClub ────────────────────────────────────────────────────

  it("listPledgesForClub: paginiert", async () => {
    const result = await listPledgesForClub("club_a", {
      pagination: { page: 1, pageSize: 10 }
    });
    // 2 pledges × 1 rule each = 2 rows
    expect(result.total).toBe(2);
    expect(result.rows[0].lifetimeChargedCents).toBeGreaterThan(0);
  });

  it("listPledgesForClub: filter status active", async () => {
    const result = await listPledgesForClub("club_a", {
      pagination: { page: 1, pageSize: 10 },
      filter: { status: "active" }
    });
    expect(result.total).toBe(2);
  });

  it("listPledgesForClub: filter teamId", async () => {
    const result = await listPledgesForClub("club_a", {
      pagination: { page: 1, pageSize: 10 },
      filter: { teamId: "team_1" }
    });
    expect(result.total).toBe(1);
    expect(result.rows[0].teamId).toBe("team_1");
  });

  it("listPledgesForClub: scoped per club", async () => {
    const result = await listPledgesForClub("club_b", {
      pagination: { page: 1, pageSize: 10 }
    });
    expect(result.total).toBe(0);
  });

  // ─── getSponsorOverviewForClub ─────────────────────────────────────────────

  it("getSponsorOverviewForClub: aggregates per trigger correctly", async () => {
    const ov = await getSponsorOverviewForClub("club_a", "sp_1");
    expect(ov).not.toBeNull();
    expect(ov!.sponsor.id).toBe("sp_1");
    expect(ov!.totals.activePledges).toBe(1);
    expect(ov!.totals.totalChargesLifetimeCents).toBe(1000 + 1000); // 2× 10 EUR
    expect(ov!.teams.length).toBe(1);
    expect(ov!.teams[0].teamId).toBe("team_1");
    expect(ov!.triggerBreakdown[0].triggerType).toBe("goal_total");
    expect(ov!.triggerBreakdown[0].sumCents).toBe(2000);
  });

  it("getSponsorOverviewForClub: returns null for unknown sponsor", async () => {
    const ov = await getSponsorOverviewForClub("club_a", "unknown");
    expect(ov).toBeNull();
  });

  it("getSponsorOverviewForClub: scoped per club — other club charges nicht eingerechnet", async () => {
    // sp_1 hat nur Pledges/Charges in club_a; in club_b sollte das Overview leer sein.
    const ov = await getSponsorOverviewForClub("club_b", "sp_1");
    expect(ov).not.toBeNull();
    expect(ov!.totals.totalChargesLifetimeCents).toBe(0);
    expect(ov!.teams.length).toBe(0);
  });

  // ─── getVereinDashboardKpis ────────────────────────────────────────────────

  it("getVereinDashboardKpis: liefert sponsorCount (distinct) + verifiedAt", async () => {
    const kpis = await getVereinDashboardKpis("club_a", new Date());
    // 2 Pledges von 2 verschiedenen Sponsoren → 2 distinct Sponsoren.
    expect(kpis.sponsorCount).toBe(2);
    // Seed setzt kein verified_at → null.
    expect(kpis.verifiedAt).toBeNull();
    expect(kpis.activePledgeCount).toBe(2);
    expect(kpis.teamRows.length).toBe(2);
  });

  it("getVereinDashboardKpis: club ohne Teams/Pledges → 0/leer", async () => {
    const kpis = await getVereinDashboardKpis("club_b", new Date());
    expect(kpis.sponsorCount).toBe(0);
    expect(kpis.teamRows.length).toBe(0);
    expect(kpis.activePledgeCount).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Seed: zwei Clubs, zwei Teams, zwei Sponsoren, 2 Pledges, 2 Matches, 4 Charges
// ───────────────────────────────────────────────────────────────────────────

async function seed() {
  const db = await getTestDb();

  await db.insert(clubs).values([
    { id: "club_a", slug: "club-a", name: "FC A", isSmallBusiness: false },
    { id: "club_b", slug: "club-b", name: "FC B", isSmallBusiness: false }
  ]);

  await db.insert(teams).values([
    {
      id: "team_1",
      clubId: "club_a",
      name: "Team 1",
      saison: "2025/26"
    },
    {
      id: "team_2",
      clubId: "club_a",
      name: "Team 2",
      saison: "2025/26"
    }
  ]);

  await db.insert(users).values([
    {
      id: "u_sp1",
      name: "Sponsor One",
      email: "sp1@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: "u_sp2",
      name: "Sponsor Two",
      email: "sp2@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ]);

  await db.insert(sponsors).values([
    {
      id: "sp_1",
      userId: "u_sp1",
      displayName: "Sponsor 1",
      type: "familie"
    },
    {
      id: "sp_2",
      userId: "u_sp2",
      displayName: "Sponsor 2",
      type: "business",
      businessName: "Biz GmbH"
    }
  ]);

  const endsAt = new Date(Date.UTC(2030, 0, 1));

  await db.insert(pledges).values([
    {
      id: "pl_1",
      sponsorId: "sp_1",
      teamId: "team_1",
      status: "active",
      endsAt,
      monthlyCapCents: 5000
    },
    {
      id: "pl_2",
      sponsorId: "sp_2",
      teamId: "team_2",
      status: "active",
      endsAt,
      monthlyCapCents: 10000
    }
  ]);

  await db.insert(pledgeRules).values([
    {
      id: "pr_1",
      pledgeId: "pl_1",
      triggerType: "goal_total",
      amountCents: 1000,
      requiresApproval: false
    },
    {
      id: "pr_2",
      pledgeId: "pl_2",
      triggerType: "win",
      amountCents: 500,
      requiresApproval: false
    }
  ]);

  await db.insert(matches).values([
    {
      id: "m_1",
      teamId: "team_1",
      fussballdeSpielId: "fs_1",
      datum: new Date(Date.UTC(2025, 8, 1, 14, 0)),
      heimName: "Team 1",
      gastName: "FC X",
      ergebnisHeim: 2,
      ergebnisGast: 1,
      status: "finished"
    },
    {
      id: "m_2",
      teamId: "team_2",
      fussballdeSpielId: "fs_2",
      datum: new Date(Date.UTC(2025, 8, 8, 14, 0)),
      heimName: "Team 2",
      gastName: "FC Y",
      ergebnisHeim: 3,
      ergebnisGast: 0,
      status: "finished"
    },
    // Zweite Spiele pro Team — tragen je die zweite Charge (c_2/c_4), damit der
    // partielle Unique-Index charges_unique_match_trigger_idx
    // (pledge_rule_id, match_id, trigger_type) nicht verletzt wird.
    {
      id: "m_3",
      teamId: "team_1",
      fussballdeSpielId: "fs_3",
      datum: new Date(Date.UTC(2025, 8, 15, 14, 0)),
      heimName: "Team 1",
      gastName: "FC Z",
      ergebnisHeim: 1,
      ergebnisGast: 0,
      status: "finished"
    },
    {
      id: "m_4",
      teamId: "team_2",
      fussballdeSpielId: "fs_4",
      datum: new Date(Date.UTC(2025, 8, 22, 14, 0)),
      heimName: "Team 2",
      gastName: "FC W",
      ergebnisHeim: 2,
      ergebnisGast: 2,
      status: "finished"
    }
  ]);

  const now = new Date();
  await db.insert(charges).values([
    {
      id: "c_1",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_1",
      matchId: "m_1",
      triggerType: "goal_total",
      amountCents: 1000,
      status: "confirmed",
      confirmedAt: now
    },
    {
      id: "c_2",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_1",
      matchId: "m_3",
      triggerType: "goal_total",
      amountCents: 1000,
      status: "confirmed",
      confirmedAt: now
    },
    {
      id: "c_3",
      pledgeId: "pl_2",
      pledgeRuleId: "pr_2",
      matchId: "m_2",
      triggerType: "win",
      amountCents: 500,
      status: "confirmed",
      confirmedAt: now
    },
    {
      id: "c_4",
      pledgeId: "pl_2",
      pledgeRuleId: "pr_2",
      matchId: "m_4",
      triggerType: "win",
      amountCents: 500,
      status: "confirmed",
      confirmedAt: now
    }
  ]);
}
