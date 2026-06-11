/**
 * Regression: Sommerpause-Charge-Lücke (Audit 2026-06-11, Phase 1).
 *
 * Der Sommerpause-Cron setzt am 1.6. alle aktiven Pledges auf `paused`, der
 * Crawler läuft aber absichtlich bis 15.6. weiter (Relegation, Nachholspiele,
 * spät eingetragene Ergebnisse). `loadActivePledgeRulesForTeam` filterte
 * `paused` komplett raus → alle zwischen 1.6. und 15.6. gescrapten Spiele
 * erzeugten still 0 Charges (und wurden mangels Content-Hash-Änderung nie
 * re-evaluiert).
 *
 * Soll-Semantik:
 *  - sommerpausePaused=true  → Pledge bedient weiterhin alle Spiele in seinem
 *    Fenster [startsAt, endsAt] (das endet eh am 30.6.).
 *  - manuelle Pause (pausedAt) → Spiele VOR der Pause werden weiter bedient
 *    (analog H4c für ended), Spiele NACH der Pause nicht.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  users,
  clubs,
  teams,
  sponsors,
  pledges,
  pledgeRules
} from "@/lib/db/schema";
import { loadActivePledgeRulesForTeam } from "@/lib/db/queries/evaluation";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";

async function seedTeamWithPledge(opts: {
  status: "active" | "paused" | "ended";
  sommerpausePaused?: boolean;
  pausedAt?: Date | null;
}): Promise<string> {
  const db = await getTestDb();
  await db.insert(users).values({ id: "u_pause", email: "pause@example.com" });
  await db
    .insert(clubs)
    .values({ id: "c_pause", slug: "pause-fc", name: "Pause FC" });
  const [t] = await db
    .insert(teams)
    .values({
      clubId: "c_pause",
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: "TEAM_PAUSE",
      fussballdeSlug: "pause-fc-1",
      isActive: true
    })
    .returning();
  const [s] = await db
    .insert(sponsors)
    .values({ userId: "u_pause", displayName: "Onkel Theo", type: "familie" })
    .returning();
  const [p] = await db
    .insert(pledges)
    .values({
      sponsorId: s.id,
      teamId: t.id,
      status: opts.status,
      sommerpausePaused: opts.sommerpausePaused ?? false,
      pausedAt: opts.pausedAt ?? null,
      startsAt: new Date("2025-08-01T00:00:00Z"),
      endsAt: new Date("2026-06-30T23:59:59Z"),
      monthlyCapCents: null
    })
    .returning();
  await db.insert(pledgeRules).values({
    pledgeId: p.id,
    triggerType: "goal_total",
    triggerParamsJson: {},
    amountCents: 500,
    requiresApproval: false
  });
  return t.id;
}

describe.skipIf(isIntegrationDbDisabled)(
  "loadActivePledgeRulesForTeam — pausierte Pledges",
  () => {
    beforeEach(async () => {
      await resetTestDb();
    });

    afterAll(async () => {
      await closeTestDb();
    });

    it("liefert Rules für sommerpause-pausierte Pledges (Spiel im Fenster, 7.6.)", async () => {
      const teamId = await seedTeamWithPledge({
        status: "paused",
        sommerpausePaused: true
      });
      const rules = await loadActivePledgeRulesForTeam(
        teamId,
        new Date("2026-06-07T15:00:00Z")
      );
      expect(rules).toHaveLength(1);
      expect(rules[0].triggerType).toBe("goal_total");
    });

    it("liefert Rules für manuell pausierte Pledges, wenn das Spiel VOR der Pause lag", async () => {
      const teamId = await seedTeamWithPledge({
        status: "paused",
        pausedAt: new Date("2026-06-06T10:00:00Z")
      });
      const rules = await loadActivePledgeRulesForTeam(
        teamId,
        new Date("2026-06-05T15:00:00Z")
      );
      expect(rules).toHaveLength(1);
    });

    it("liefert KEINE Rules für manuell pausierte Pledges bei Spielen NACH der Pause", async () => {
      const teamId = await seedTeamWithPledge({
        status: "paused",
        pausedAt: new Date("2026-06-06T10:00:00Z")
      });
      const rules = await loadActivePledgeRulesForTeam(
        teamId,
        new Date("2026-06-07T15:00:00Z")
      );
      expect(rules).toHaveLength(0);
    });

    it("liefert KEINE Rules für Alt-Pausen ohne Marker (paused, kein Flag, kein pausedAt)", async () => {
      // Defensive: paused-Rows aus der Zeit vor pausedAt — ohne Marker können
      // wir den Pausen-Zeitpunkt nicht kennen → konservativ nicht abrechnen.
      const teamId = await seedTeamWithPledge({ status: "paused" });
      const rules = await loadActivePledgeRulesForTeam(
        teamId,
        new Date("2026-06-05T15:00:00Z")
      );
      expect(rules).toHaveLength(0);
    });
  }
);
