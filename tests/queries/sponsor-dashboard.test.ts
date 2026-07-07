/**
 * Integration tests für `lib/db/queries/sponsor-dashboard.ts` —
 * speziell die Periodisierung + Status-Filterung der Geld-Kacheln in
 * `getSponsorDashboardKpis`.
 *
 * Die Kacheln müssen sich mit Bilanz (sponsor-reporting), Cap-Fenster
 * (evaluation.getMonthlyChargedCents) und Rechnungslauf (charges) decken:
 *  - Fenster über COALESCE(confirmedAt, createdAt), NICHT rein createdAt
 *    (Spät-Confirms gehören in den Confirm-Monat/-Jahr).
 *  - nur confirmed | invoiced zählen als „diesen Monat / YTD" fälliges Geld
 *    (pending_approval + cancelled bleiben draußen).
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
import { getSponsorDashboardKpis } from "@/lib/db/queries/sponsor-dashboard";

describe.skipIf(isIntegrationDbDisabled)("sponsor-dashboard KPIs (integration)", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seed();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("monthlyCents: Spät-Confirm zählt im confirmedAt-Monat (Feb), nicht createdAt-Monat (Jan)", async () => {
    // now = Feb 2026. c_late (createdAt Jan, confirmedAt Feb) gehört in Feb.
    const kpis = await getSponsorDashboardKpis("sp_1", new Date(Date.UTC(2026, 1, 15)));
    // c_late (1000, confirmed Feb) + c_feb (3000) = 4000
    expect(kpis.monthlyCents).toBe(4000);
  });

  it("monthlyCents: Spät-Confirm zählt NICHT im createdAt-Monat (Jan)", async () => {
    // now = Jan 2026. c_late (createdAt Jan) ist erst im Feb confirmed → nicht Jan.
    const kpis = await getSponsorDashboardKpis("sp_1", new Date(Date.UTC(2026, 0, 15)));
    // nur c_dec (7000, confirmed Jan 3) fällt in Jan
    expect(kpis.monthlyCents).toBe(7000);
  });

  it("monthlyCents: cancelled + pending_approval zählen nicht", async () => {
    const kpis = await getSponsorDashboardKpis("sp_1", new Date(Date.UTC(2026, 1, 15)));
    // c_cancelled (500) + c_pending (900) sind im Feb, dürfen aber NICHT zählen
    expect(kpis.monthlyCents).toBe(4000);
  });

  it("ytd/lastYear: Spät-Confirm über Jahresgrenze zählt im Confirm-Jahr", async () => {
    const kpis = await getSponsorDashboardKpis("sp_1", new Date(Date.UTC(2026, 1, 15)));
    // 2026 confirmed: c_dec (7000, confirmed Jan 26) + c_late (1000) + c_feb (3000) = 11000
    expect(kpis.ytdCents).toBe(11000);
    // 2025: nichts confirmed → 0 (c_dec ist trotz createdAt Dec 2025 im Jan 2026 confirmed)
    expect(kpis.lastYearCents).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Seed: ein Sponsor, ein Team, ein Pledge; Charges mit gezielt gesetztem
// createdAt/confirmedAt/status über die Monats-/Jahresgrenze.
// Distinkte Matches je Charge (partieller Unique-Index über
// pledge_rule_id + match_id + trigger_type).
// ───────────────────────────────────────────────────────────────────────────

async function seed() {
  const db = await getTestDb();

  await db.insert(clubs).values([
    { id: "club_a", slug: "club-a", name: "FC A", isSmallBusiness: false }
  ]);

  await db.insert(teams).values([
    { id: "team_1", clubId: "club_a", name: "Team 1", saison: "2025/26" }
  ]);

  await db.insert(users).values([
    {
      id: "u_sp1",
      name: "S1",
      email: "s1@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ]);

  await db.insert(sponsors).values([
    { id: "sp_1", userId: "u_sp1", displayName: "Sponsor 1", type: "familie" }
  ]);

  await db.insert(pledges).values([
    {
      id: "pl_1",
      sponsorId: "sp_1",
      teamId: "team_1",
      status: "active",
      endsAt: new Date(Date.UTC(2030, 0, 1)),
      monthlyCapCents: 100000
    }
  ]);

  await db.insert(pledgeRules).values([
    {
      id: "pr_1",
      pledgeId: "pl_1",
      triggerType: "goal_total",
      amountCents: 1000,
      requiresApproval: false
    }
  ]);

  const matchRows = ["m_late", "m_feb", "m_cancel", "m_pending", "m_dec"].map(
    (id, i) => ({
      id,
      teamId: "team_1",
      fussballdeSpielId: `fs_${i}`,
      datum: new Date(Date.UTC(2026, 0, 1 + i, 14, 0)),
      heimName: "Team 1",
      gastName: "FC X",
      ergebnisHeim: 1,
      ergebnisGast: 0,
      status: "finished" as const
    })
  );
  await db.insert(matches).values(matchRows);

  await db.insert(charges).values([
    // Spät-Confirm: createdAt Jan, confirmedAt Feb → gehört in Feb
    {
      id: "c_late",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_1",
      matchId: "m_late",
      triggerType: "goal_total",
      amountCents: 1000,
      status: "confirmed",
      createdAt: new Date(Date.UTC(2026, 0, 20)),
      confirmedAt: new Date(Date.UTC(2026, 1, 5))
    },
    // normaler Feb-Charge
    {
      id: "c_feb",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_1",
      matchId: "m_feb",
      triggerType: "goal_total",
      amountCents: 3000,
      status: "confirmed",
      createdAt: new Date(Date.UTC(2026, 1, 8)),
      confirmedAt: new Date(Date.UTC(2026, 1, 8))
    },
    // cancelled im Feb → darf nicht zählen
    {
      id: "c_cancelled",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_1",
      matchId: "m_cancel",
      triggerType: "goal_total",
      amountCents: 500,
      status: "cancelled",
      createdAt: new Date(Date.UTC(2026, 1, 10)),
      confirmedAt: new Date(Date.UTC(2026, 1, 10))
    },
    // pending_approval im Feb → darf nicht zählen
    {
      id: "c_pending",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_1",
      matchId: "m_pending",
      triggerType: "goal_total",
      amountCents: 900,
      status: "pending_approval",
      createdAt: new Date(Date.UTC(2026, 1, 12)),
      confirmedAt: null
    },
    // createdAt Dez 2025, confirmedAt Jan 2026 → gehört in Jan/YTD 2026
    {
      id: "c_dec",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_1",
      matchId: "m_dec",
      triggerType: "goal_total",
      amountCents: 7000,
      status: "confirmed",
      createdAt: new Date(Date.UTC(2025, 11, 28)),
      confirmedAt: new Date(Date.UTC(2026, 0, 3))
    }
  ]);
}
