/**
 * Paket A.3 (Spec 2026-05-26 §1.2) — Monats-Rechnungslauf filtert nach
 * Billing-Cycle-Snapshot:
 *
 *  - snapshot='monthly'                                  → auf die Monatsrechnung
 *  - snapshot='season_end' UND Sponsor AKTUELL season_end → sammeln (NICHT monatlich)
 *  - snapshot='season_end' UND Sponsor AKTUELL monthly    → auf die ERSTE
 *    Monatsrechnung (Spec-Wechsel-Regel „season_end→monthly: bisher gesammelte
 *    Charges werden mit der ersten Monatsrechnung beglichen").
 *
 * Integration gegen die Docker-Test-DB (DATABASE_URL_TEST).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  users,
  clubs,
  teams,
  sponsors,
  pledges,
  pledgeRules,
  charges
} from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import { listConfirmedChargesByPeriod } from "@/lib/db/queries/charges";

const PERIOD = {
  periodStart: new Date(Date.UTC(2026, 4, 1)),
  periodEnd: new Date(Date.UTC(2026, 5, 1))
};

async function seed(opts: {
  sponsorCycle: "monthly" | "season_end";
  chargeSnapshots: ("monthly" | "season_end")[];
}) {
  const tdb = await getTestDb();
  await tdb.insert(users).values({ id: "u_f", email: "f@example.com" });
  await tdb.insert(clubs).values({ id: "c_f", slug: "f-fc", name: "Filter FC" });
  await tdb.insert(teams).values({
    id: "t_f",
    clubId: "c_f",
    name: "1. Herren",
    saison: "2526"
  });
  await tdb.insert(sponsors).values({
    id: "sp_f",
    userId: "u_f",
    displayName: "Filter-Sponsor",
    type: "familie",
    billingCycle: opts.sponsorCycle
  });
  await tdb.insert(pledges).values({
    id: "pl_f",
    sponsorId: "sp_f",
    teamId: "t_f",
    status: "active",
    startsAt: new Date(Date.UTC(2025, 6, 1)),
    endsAt: new Date(Date.UTC(2026, 5, 30))
  });
  await tdb.insert(pledgeRules).values({
    id: "pr_f",
    pledgeId: "pl_f",
    triggerType: "goal_total",
    amountCents: 500,
    requiresApproval: false
  });
  await tdb.insert(charges).values(
    opts.chargeSnapshots.map((snapshot, i) => ({
      id: `ch_f_${i}`,
      pledgeId: "pl_f",
      pledgeRuleId: "pr_f",
      matchId: null,
      saison: null,
      goalIndex: i + 1,
      triggerType: "goal_total" as const,
      amountCents: 500,
      billingCycleSnapshot: snapshot,
      status: "confirmed" as const,
      confirmedAt: new Date(Date.UTC(2026, 4, 10 + i))
    }))
  );
}

describe.skipIf(isIntegrationDbDisabled)(
  "listConfirmedChargesByPeriod — Billing-Cycle-Filter",
  () => {
    beforeEach(async () => {
      await resetTestDb();
    });
    afterAll(async () => {
      await closeTestDb();
    });

    it("monthly-Snapshots landen auf der Monatsrechnung (Bestand unverändert)", async () => {
      await seed({ sponsorCycle: "monthly", chargeSnapshots: ["monthly", "monthly"] });
      const rows = await listConfirmedChargesByPeriod(PERIOD);
      expect(rows).toHaveLength(2);
    });

    it("season_end-Snapshot + Sponsor aktuell season_end → NICHT monatlich fakturiert", async () => {
      await seed({
        sponsorCycle: "season_end",
        chargeSnapshots: ["season_end", "monthly"]
      });
      const rows = await listConfirmedChargesByPeriod(PERIOD);
      // Nur die monthly-Snapshot-Charge (aus der Zeit VOR dem Wechsel)
      expect(rows).toHaveLength(1);
      expect(rows[0].chargeId).toBe("ch_f_1");
    });

    it("season_end-Snapshot + Sponsor zurück auf monthly → erste Monatsrechnung nimmt Gesammeltes mit", async () => {
      await seed({
        sponsorCycle: "monthly",
        chargeSnapshots: ["season_end", "monthly"]
      });
      const rows = await listConfirmedChargesByPeriod(PERIOD);
      expect(rows).toHaveLength(2);
    });

    it("K1: Gesammeltes ÄLTER als die Periode strandet nicht (Okt-Charge, Wechsel im Mai)", async () => {
      // Review K1 (2026-06-12): Sponsor sammelte ab Oktober (season_end),
      // wechselte im Mai zurück auf monthly. Die Okt-Charge liegt VOR dem
      // Mai-Fenster — mit unterer Fenstergrenze hätte sie kein Cron je
      // selektiert (Saison-Cron schließt monthly-Sponsoren aus).
      await seed({ sponsorCycle: "monthly", chargeSnapshots: ["season_end"] });
      const tdb = await getTestDb();
      await tdb.insert(charges).values({
        id: "ch_f_old",
        pledgeId: "pl_f",
        pledgeRuleId: "pr_f",
        matchId: null,
        saison: null,
        goalIndex: 99,
        triggerType: "goal_total",
        amountCents: 500,
        billingCycleSnapshot: "season_end",
        status: "confirmed",
        confirmedAt: new Date(Date.UTC(2025, 9, 12)) // Oktober 2025
      });
      const rows = await listConfirmedChargesByPeriod(PERIOD);
      expect(rows.map((r) => r.chargeId).sort()).toEqual(["ch_f_0", "ch_f_old"]);
    });
  }
);
