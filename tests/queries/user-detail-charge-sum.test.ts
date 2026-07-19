/**
 * Integration test für `getUserDetail` (lib/db/queries/platform-stats.ts).
 *
 * Die "Σ Charges"-Spalte im Admin-User-Detail darf nur Geld zeigen, das
 * tatsächlich zählt: Status ∈ CAP_COUNTED_STATUSES (confirmed + invoiced).
 * `cancelled` (Storno nach fussball.de-Korrektur) und `pending_approval`
 * (unbestätigtes Manual Event) sind KEIN Geld.
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
import { getUserDetail } from "@/lib/db/queries/platform-stats";

describe.skipIf(isIntegrationDbDisabled)("getUserDetail: Σ Charges (integration)", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seed();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("zählt nur confirmed + invoiced — cancelled und pending_approval nicht", async () => {
    const detail = await getUserDetail("u_sp1");
    expect(detail).not.toBeNull();
    const sponsor = detail!.sponsors.find((s) => s.id === "sp_1");
    // confirmed 1000 + invoiced 2000 = 3000; cancelled 5000 und
    // pending_approval 4000 bleiben draußen.
    expect(sponsor?.totalAmountCents).toBe(3000);
  });

  it("Sponsor ohne zählende Charges zeigt 0 statt der Storno-Summe", async () => {
    const detail = await getUserDetail("u_sp2");
    const sponsor = detail!.sponsors.find((s) => s.id === "sp_2");
    expect(sponsor?.totalAmountCents).toBe(0);
    // pledgeCount bleibt unberührt vom Status-Filter
    expect(sponsor?.pledgeCount).toBe(1);
  });
});

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
    { id: "sp_2", userId: "u_sp2", displayName: "Sponsor 2", type: "familie" }
  ]);

  const endsAt = new Date(Date.UTC(2030, 0, 1));
  await db.insert(pledges).values([
    { id: "pl_1", sponsorId: "sp_1", teamId: "team_1", status: "active", endsAt, monthlyCapCents: 50000 },
    { id: "pl_2", sponsorId: "sp_2", teamId: "team_1", status: "active", endsAt, monthlyCapCents: 50000 }
  ]);
  await db.insert(pledgeRules).values([
    { id: "pr_1", pledgeId: "pl_1", triggerType: "goal_total", amountCents: 1000, requiresApproval: false },
    { id: "pr_2", pledgeId: "pl_2", triggerType: "win", amountCents: 5000, requiresApproval: false }
  ]);

  // Ein Match pro Charge — der partielle Unique-Index
  // charges_unique_match_trigger_idx (pledge_rule_id, match_id, trigger_type)
  // verbietet mehrere Charges derselben Regel auf demselben Spiel.
  await db.insert(matches).values(
    [1, 2, 3, 4, 5].map((n) => ({
      id: `m_${n}`,
      teamId: "team_1",
      fussballdeSpielId: `fs_${n}`,
      datum: new Date(Date.UTC(2025, 8, n, 14, 0)),
      heimName: "Team 1",
      gastName: `FC ${n}`,
      ergebnisHeim: 2,
      ergebnisGast: 1,
      status: "finished" as const
    }))
  );

  const at = new Date(Date.UTC(2025, 8, 20));
  await db.insert(charges).values([
    // sp_1: zählt
    { id: "c_1", pledgeId: "pl_1", pledgeRuleId: "pr_1", matchId: "m_1", triggerType: "goal_total", amountCents: 1000, status: "confirmed", createdAt: at, confirmedAt: at },
    { id: "c_2", pledgeId: "pl_1", pledgeRuleId: "pr_1", matchId: "m_2", triggerType: "goal_total", amountCents: 2000, status: "invoiced", createdAt: at, confirmedAt: at },
    // sp_1: zählt NICHT
    { id: "c_3", pledgeId: "pl_1", pledgeRuleId: "pr_1", matchId: "m_3", triggerType: "goal_total", amountCents: 5000, status: "cancelled", createdAt: at },
    { id: "c_4", pledgeId: "pl_1", pledgeRuleId: "pr_1", matchId: "m_4", triggerType: "goal_total", amountCents: 4000, status: "pending_approval", createdAt: at },
    // sp_2: ausschließlich storniert → 0
    { id: "c_5", pledgeId: "pl_2", pledgeRuleId: "pr_2", matchId: "m_5", triggerType: "win", amountCents: 5000, status: "cancelled", createdAt: at }
  ]);
}
