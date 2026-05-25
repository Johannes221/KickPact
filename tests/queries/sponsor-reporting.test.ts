/**
 * Integration tests für `lib/db/queries/sponsor-reporting.ts`.
 *
 * Seedet zwei Sponsoren, zwei Clubs, zwei Teams, zwei Pledges + Charges in
 * verschiedenen Monaten und prüft Aggregate, Filter und Cap-Auslastung.
 *
 * Gated via `isIntegrationDbDisabled` wie die anderen Query-Suites.
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
  getCapUsageForActivePledges,
  getRangeForOption,
  getSponsorBalance,
  listChargesForSponsor,
  parseCustomRange
} from "@/lib/db/queries/sponsor-reporting";

describe.skipIf(isIntegrationDbDisabled)("sponsor-reporting (integration)", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seed();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  // ── getSponsorBalance ─────────────────────────────────────────────────────

  it("getSponsorBalance: aggregates totals over a wide range", async () => {
    const range = {
      from: new Date(Date.UTC(2024, 0, 1)),
      to: new Date(Date.UTC(2030, 0, 1))
    };
    const bal = await getSponsorBalance("sp_1", range);
    // sp_1 hat 3 confirmed charges: 1000 + 1000 + 2000 = 4000
    expect(bal.totalCents).toBe(4000);
    expect(bal.eventsCount).toBe(3);
    expect(bal.clubCount).toBe(2); // beide clubs
    expect(bal.pledgeCount).toBe(2); // 2 pledges genutzt
  });

  it("getSponsorBalance: byClub-Breakdown korrekt", async () => {
    const range = {
      from: new Date(Date.UTC(2024, 0, 1)),
      to: new Date(Date.UTC(2030, 0, 1))
    };
    const bal = await getSponsorBalance("sp_1", range);
    expect(bal.byClub.length).toBe(2);
    const clubA = bal.byClub.find((c) => c.clubId === "club_a");
    expect(clubA?.totalCents).toBe(2000); // c_1 + c_2
    expect(clubA?.eventsCount).toBe(2);
    const clubB = bal.byClub.find((c) => c.clubId === "club_b");
    expect(clubB?.totalCents).toBe(2000); // c_3
    expect(clubB?.eventsCount).toBe(1);
  });

  it("getSponsorBalance: byTrigger-Breakdown korrekt", async () => {
    const range = {
      from: new Date(Date.UTC(2024, 0, 1)),
      to: new Date(Date.UTC(2030, 0, 1))
    };
    const bal = await getSponsorBalance("sp_1", range);
    const goalTotal = bal.byTrigger.find((t) => t.triggerType === "goal_total");
    expect(goalTotal?.totalCents).toBe(2000); // 2× 1000
    expect(goalTotal?.eventsCount).toBe(2);
    const win = bal.byTrigger.find((t) => t.triggerType === "win");
    expect(win?.totalCents).toBe(2000);
  });

  it("getSponsorBalance: byMonth-Breakdown gruppiert per Monat", async () => {
    const range = {
      from: new Date(Date.UTC(2024, 0, 1)),
      to: new Date(Date.UTC(2030, 0, 1))
    };
    const bal = await getSponsorBalance("sp_1", range);
    // c_1 + c_2: Sept 2025; c_3: Okt 2025
    expect(bal.byMonth.length).toBe(2);
    const sep = bal.byMonth.find((m) => m.month === "2025-09");
    expect(sep?.totalCents).toBe(2000);
    const okt = bal.byMonth.find((m) => m.month === "2025-10");
    expect(okt?.totalCents).toBe(2000);
  });

  it("getSponsorBalance: scoped per sponsor — fremder sponsor leakt nicht", async () => {
    const range = {
      from: new Date(Date.UTC(2024, 0, 1)),
      to: new Date(Date.UTC(2030, 0, 1))
    };
    const bal = await getSponsorBalance("sp_2", range);
    expect(bal.totalCents).toBe(500); // 1 charge for sp_2
    expect(bal.eventsCount).toBe(1);
  });

  it("getSponsorBalance: range-filter schliesst alte Charges aus", async () => {
    // nur Oktober 2025
    const range = {
      from: new Date(Date.UTC(2025, 9, 1)),
      to: new Date(Date.UTC(2025, 10, 1))
    };
    const bal = await getSponsorBalance("sp_1", range);
    expect(bal.totalCents).toBe(2000); // nur c_3
    expect(bal.eventsCount).toBe(1);
  });

  it("getSponsorBalance: cancelled charges werden ignoriert", async () => {
    const db = await getTestDb();
    // Markiere c_1 als cancelled
    const { eq } = await import("drizzle-orm");
    await db.update(charges).set({ status: "cancelled" }).where(eq(charges.id, "c_1"));

    const range = {
      from: new Date(Date.UTC(2024, 0, 1)),
      to: new Date(Date.UTC(2030, 0, 1))
    };
    const bal = await getSponsorBalance("sp_1", range);
    expect(bal.totalCents).toBe(3000); // 4000 - 1000 (cancelled)
    expect(bal.eventsCount).toBe(2);
  });

  // ── listChargesForSponsor ─────────────────────────────────────────────────

  it("listChargesForSponsor: ohne pagination liefert alle Rows", async () => {
    const rows = await listChargesForSponsor("sp_1");
    expect(rows.length).toBe(3);
  });

  it("listChargesForSponsor: paginated", async () => {
    const result = await listChargesForSponsor("sp_1", {
      pagination: { page: 1, pageSize: 2 }
    });
    expect(result.total).toBe(3);
    expect(result.totalPages).toBe(2);
    expect(result.rows.length).toBe(2);
  });

  it("listChargesForSponsor: filter clubIds", async () => {
    const result = await listChargesForSponsor("sp_1", {
      pagination: { page: 1, pageSize: 10 },
      filters: { clubIds: ["club_b"] }
    });
    expect(result.total).toBe(1);
    expect(result.rows[0].clubId).toBe("club_b");
  });

  it("listChargesForSponsor: filter triggerTypes", async () => {
    const result = await listChargesForSponsor("sp_1", {
      pagination: { page: 1, pageSize: 10 },
      filters: { triggerTypes: ["win"] }
    });
    expect(result.total).toBe(1);
    expect(result.rows[0].triggerType).toBe("win");
  });

  it("listChargesForSponsor: filter status", async () => {
    const result = await listChargesForSponsor("sp_1", {
      pagination: { page: 1, pageSize: 10 },
      filters: { statuses: ["confirmed"] }
    });
    expect(result.total).toBe(3);
  });

  it("listChargesForSponsor: scoped per sponsor", async () => {
    const result = await listChargesForSponsor("sp_2", {
      pagination: { page: 1, pageSize: 10 }
    });
    expect(result.total).toBe(1);
    expect(result.rows[0].id).toBe("c_4");
  });

  it("listChargesForSponsor: sort by amountCents asc", async () => {
    const result = await listChargesForSponsor("sp_1", {
      pagination: { page: 1, pageSize: 10 },
      sort: "amountCents",
      dir: "asc"
    });
    const amts = result.rows.map((r) => r.amountCents);
    expect(amts).toEqual([...amts].sort((a, b) => a - b));
  });

  it("listChargesForSponsor: ohne pagination + filter funktioniert für CSV-Export", async () => {
    const rows = await listChargesForSponsor("sp_1", {
      filters: { clubIds: ["club_a"] }
    });
    expect(rows.length).toBe(2);
  });

  // ── getCapUsageForActivePledges ───────────────────────────────────────────

  it("getCapUsageForActivePledges: 2 active pledges für sp_1, sortiert nach Auslastung", async () => {
    const usage = await getCapUsageForActivePledges("sp_1");
    expect(usage.length).toBe(2);
    // beide haben Caps, eine hat höhere Auslastung
    expect(usage[0].percentage).not.toBeNull();
  });

  it("getCapUsageForActivePledges: ignoriert ended pledges", async () => {
    const db = await getTestDb();
    const { eq } = await import("drizzle-orm");
    await db.update(pledges).set({ status: "ended" }).where(eq(pledges.id, "pl_1"));
    const usage = await getCapUsageForActivePledges("sp_1");
    expect(usage.length).toBe(1);
    expect(usage[0].pledgeId).toBe("pl_3");
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  it("getRangeForOption: this-month gibt Monatsanfang→Folgemonat", () => {
    const r = getRangeForOption("this-month", new Date(Date.UTC(2026, 2, 15)));
    expect(r.from.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });

  it("getRangeForOption: this-season vor August → Vorjahr-August", () => {
    const r = getRangeForOption("this-season", new Date(Date.UTC(2026, 2, 15)));
    expect(r.from.toISOString()).toBe("2025-08-01T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("getRangeForOption: this-season nach August → laufendes Jahr", () => {
    const r = getRangeForOption("this-season", new Date(Date.UTC(2026, 8, 15)));
    expect(r.from.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(r.to.toISOString()).toBe("2027-08-01T00:00:00.000Z");
  });

  it("parseCustomRange: liefert null wenn from oder to fehlt", () => {
    const sp = (rec: Record<string, string>) => ({
      get: (k: string) => rec[k] ?? null
    });
    expect(parseCustomRange(sp({}))).toBeNull();
    expect(parseCustomRange(sp({ from: "2026-01-01" }))).toBeNull();
  });

  it("parseCustomRange: parst gültige ISO-Dates", () => {
    const sp = (rec: Record<string, string>) => ({
      get: (k: string) => rec[k] ?? null
    });
    const r = parseCustomRange(sp({ from: "2026-01-01", to: "2026-02-01" }));
    expect(r?.from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(r?.to.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  it("parseCustomRange: liefert null wenn from >= to", () => {
    const sp = (rec: Record<string, string>) => ({
      get: (k: string) => rec[k] ?? null
    });
    expect(parseCustomRange(sp({ from: "2026-02-01", to: "2026-01-01" }))).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Seed: zwei Clubs (a, b), zwei Teams, zwei Sponsoren, 3 Pledges, 4 Charges
// ───────────────────────────────────────────────────────────────────────────

async function seed() {
  const db = await getTestDb();

  await db.insert(clubs).values([
    { id: "club_a", slug: "club-a", name: "FC A", isSmallBusiness: false },
    { id: "club_b", slug: "club-b", name: "FC B", isSmallBusiness: false }
  ]);

  await db.insert(teams).values([
    { id: "team_1", clubId: "club_a", name: "Team 1", saison: "2025/26" },
    { id: "team_2", clubId: "club_b", name: "Team 2", saison: "2025/26" }
  ]);

  await db.insert(users).values([
    {
      id: "u_sp1",
      name: "S1",
      email: "s1@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: "u_sp2",
      name: "S2",
      email: "s2@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ]);

  await db.insert(sponsors).values([
    { id: "sp_1", userId: "u_sp1", displayName: "Sponsor 1", type: "familie" },
    { id: "sp_2", userId: "u_sp2", displayName: "Sponsor 2", type: "business" }
  ]);

  const endsAt = new Date(Date.UTC(2030, 0, 1));

  await db.insert(pledges).values([
    // sp_1 → team_1 (club_a)
    {
      id: "pl_1",
      sponsorId: "sp_1",
      teamId: "team_1",
      status: "active",
      endsAt,
      monthlyCapCents: 5000
    },
    // sp_1 → team_2 (club_b)
    {
      id: "pl_3",
      sponsorId: "sp_1",
      teamId: "team_2",
      status: "active",
      endsAt,
      monthlyCapCents: 10000
    },
    // sp_2 → team_1
    {
      id: "pl_2",
      sponsorId: "sp_2",
      teamId: "team_1",
      status: "active",
      endsAt,
      monthlyCapCents: 5000
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
      id: "pr_3",
      pledgeId: "pl_3",
      triggerType: "win",
      amountCents: 2000,
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
      datum: new Date(Date.UTC(2025, 9, 8, 14, 0)),
      heimName: "Team 2",
      gastName: "FC Y",
      ergebnisHeim: 3,
      ergebnisGast: 0,
      status: "finished"
    }
  ]);

  // Charges für sp_1: 2× im September (club_a), 1× im Oktober (club_b)
  // Charge für sp_2: 1× im September (club_a)
  await db.insert(charges).values([
    {
      id: "c_1",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_1",
      matchId: "m_1",
      triggerType: "goal_total",
      amountCents: 1000,
      status: "confirmed",
      createdAt: new Date(Date.UTC(2025, 8, 2)),
      confirmedAt: new Date(Date.UTC(2025, 8, 2))
    },
    {
      id: "c_2",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_1",
      matchId: "m_1",
      triggerType: "goal_total",
      amountCents: 1000,
      status: "confirmed",
      createdAt: new Date(Date.UTC(2025, 8, 2)),
      confirmedAt: new Date(Date.UTC(2025, 8, 2))
    },
    {
      id: "c_3",
      pledgeId: "pl_3",
      pledgeRuleId: "pr_3",
      matchId: "m_2",
      triggerType: "win",
      amountCents: 2000,
      status: "confirmed",
      createdAt: new Date(Date.UTC(2025, 9, 9)),
      confirmedAt: new Date(Date.UTC(2025, 9, 9))
    },
    {
      id: "c_4",
      pledgeId: "pl_2",
      pledgeRuleId: "pr_2",
      matchId: "m_1",
      triggerType: "win",
      amountCents: 500,
      status: "confirmed",
      createdAt: new Date(Date.UTC(2025, 8, 2)),
      confirmedAt: new Date(Date.UTC(2025, 8, 2))
    }
  ]);
}
