/**
 * Paket A (Spec 2026-05-26 §1.2) — Billing-Cycle pro Sponsor.
 *
 * resolveCycleAt(sponsorId, date):
 *  - jüngste sponsor_billing_cycle_history-Row mit validFrom <= date
 *  - KEINE passende Row → sponsors.billingCycle (nie gewechselt =
 *    aktueller Wert gilt rückwirkend)
 *
 * changeBillingCycleForSponsor:
 *  - Update sponsors.billingCycle + History-Append in EINER Transaktion
 *  - beim ERSTEN Wechsel zusätzlich Baseline-Row (alter Cycle ab
 *    sponsor.createdAt), damit der Zeitraum VOR dem ersten Wechsel
 *    historisch korrekt auflösbar bleibt.
 *
 * Integration gegen die Docker-Test-DB (DATABASE_URL_TEST).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, asc } from "drizzle-orm";

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "u_bc", email: "bc@example.com" })
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

import { users, sponsors, sponsorBillingCycleHistory } from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import {
  resolveCycleAt,
  changeBillingCycleForSponsor
} from "@/lib/db/queries/billing-cycle";
import { changeBillingCycle } from "@/lib/actions/billing-cycle";

const SPONSOR_ID = "sp_bc";
const CREATED_AT = new Date(Date.UTC(2025, 7, 1)); // 1.8.2025

async function seedSponsor(cycle: "monthly" | "season_end" = "monthly") {
  const tdb = await getTestDb();
  await tdb.insert(users).values({ id: "u_bc", email: "bc@example.com" });
  await tdb.insert(sponsors).values({
    id: SPONSOR_ID,
    userId: "u_bc",
    displayName: "Cycle-Sponsor",
    type: "familie",
    billingCycle: cycle,
    createdAt: CREATED_AT
  });
}

describe.skipIf(isIntegrationDbDisabled)("resolveCycleAt (integration)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("keine History → sponsors.billingCycle (Default monthly)", async () => {
    await seedSponsor("monthly");
    expect(await resolveCycleAt(SPONSOR_ID, new Date(Date.UTC(2026, 2, 1)))).toBe(
      "monthly"
    );
  });

  it("keine History, Sponsor season_end → season_end gilt rückwirkend", async () => {
    await seedSponsor("season_end");
    expect(await resolveCycleAt(SPONSOR_ID, new Date(Date.UTC(2025, 0, 1)))).toBe(
      "season_end"
    );
  });

  it("unbekannter Sponsor → monthly (defensiver Fallback)", async () => {
    expect(await resolveCycleAt("sp_unknown", new Date())).toBe("monthly");
  });

  it("History: jüngste Row mit validFrom<=date gewinnt", async () => {
    await seedSponsor("monthly");
    const tdb = await getTestDb();
    await tdb.insert(sponsorBillingCycleHistory).values([
      {
        sponsorId: SPONSOR_ID,
        cycle: "monthly",
        validFrom: CREATED_AT
      },
      {
        sponsorId: SPONSOR_ID,
        cycle: "season_end",
        validFrom: new Date(Date.UTC(2026, 4, 1)) // 1.5.2026
      }
    ]);

    // Spiel im April → monthly (Baseline-Row)
    expect(await resolveCycleAt(SPONSOR_ID, new Date(Date.UTC(2026, 3, 15)))).toBe(
      "monthly"
    );
    // Spiel am 15.5. → season_end
    expect(await resolveCycleAt(SPONSOR_ID, new Date(Date.UTC(2026, 4, 15)))).toBe(
      "season_end"
    );
    // Exakt am Wechsel-Zeitpunkt → neue Row gilt (validFrom <= date)
    expect(await resolveCycleAt(SPONSOR_ID, new Date(Date.UTC(2026, 4, 1)))).toBe(
      "season_end"
    );
  });

  it("mehrere Wechsel: monthly→season_end→monthly korrekt aufgelöst", async () => {
    await seedSponsor("monthly");
    const tdb = await getTestDb();
    await tdb.insert(sponsorBillingCycleHistory).values([
      { sponsorId: SPONSOR_ID, cycle: "monthly", validFrom: CREATED_AT },
      {
        sponsorId: SPONSOR_ID,
        cycle: "season_end",
        validFrom: new Date(Date.UTC(2025, 9, 1))
      },
      {
        sponsorId: SPONSOR_ID,
        cycle: "monthly",
        validFrom: new Date(Date.UTC(2026, 1, 1))
      }
    ]);

    expect(await resolveCycleAt(SPONSOR_ID, new Date(Date.UTC(2025, 8, 1)))).toBe(
      "monthly"
    );
    expect(await resolveCycleAt(SPONSOR_ID, new Date(Date.UTC(2025, 11, 1)))).toBe(
      "season_end"
    );
    expect(await resolveCycleAt(SPONSOR_ID, new Date(Date.UTC(2026, 2, 1)))).toBe(
      "monthly"
    );
  });
});

describe.skipIf(isIntegrationDbDisabled)(
  "changeBillingCycleForSponsor (integration)",
  () => {
    beforeEach(async () => {
      await resetTestDb();
    });
    afterAll(async () => {
      await closeTestDb();
    });

    it("erster Wechsel: Update + Baseline-Row + neue History-Row", async () => {
      await seedSponsor("monthly");
      const tdb = await getTestDb();

      await changeBillingCycleForSponsor(SPONSOR_ID, "season_end");

      const [sp] = await tdb
        .select()
        .from(sponsors)
        .where(eq(sponsors.id, SPONSOR_ID));
      expect(sp.billingCycle).toBe("season_end");

      const history = await tdb
        .select()
        .from(sponsorBillingCycleHistory)
        .where(eq(sponsorBillingCycleHistory.sponsorId, SPONSOR_ID))
        .orderBy(asc(sponsorBillingCycleHistory.validFrom));
      expect(history).toHaveLength(2);
      // Baseline: alter Cycle ab Sponsor-Erstellung
      expect(history[0].cycle).toBe("monthly");
      expect(history[0].validFrom.getTime()).toBe(CREATED_AT.getTime());
      // Wechsel-Row
      expect(history[1].cycle).toBe("season_end");

      // Damit löst eine Vor-Wechsel-Charge weiterhin monthly auf:
      expect(
        await resolveCycleAt(SPONSOR_ID, new Date(Date.UTC(2025, 9, 1)))
      ).toBe("monthly");
    });

    it("zweiter Wechsel: KEINE zweite Baseline-Row", async () => {
      await seedSponsor("monthly");
      const tdb = await getTestDb();

      await changeBillingCycleForSponsor(SPONSOR_ID, "season_end");
      await changeBillingCycleForSponsor(SPONSOR_ID, "monthly");

      const history = await tdb
        .select()
        .from(sponsorBillingCycleHistory)
        .where(eq(sponsorBillingCycleHistory.sponsorId, SPONSOR_ID));
      // Baseline + 2 Wechsel
      expect(history).toHaveLength(3);
      expect(history.filter((h) => h.validFrom.getTime() === CREATED_AT.getTime()))
        .toHaveLength(1);
    });

    it("No-Op wenn Cycle unverändert (keine History-Row)", async () => {
      await seedSponsor("monthly");
      const tdb = await getTestDb();

      await changeBillingCycleForSponsor(SPONSOR_ID, "monthly");

      const history = await tdb
        .select()
        .from(sponsorBillingCycleHistory)
        .where(eq(sponsorBillingCycleHistory.sponsorId, SPONSOR_ID));
      expect(history).toHaveLength(0);
    });
  }
);

describe.skipIf(isIntegrationDbDisabled)("changeBillingCycle Action (integration)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("Tenancy: User ohne Sponsor-Profil → ok:false", async () => {
    const res = await changeBillingCycle("season_end");
    expect(res.ok).toBe(false);
  });

  it("setzt Cycle für den Sponsor des eingeloggten Users", async () => {
    await seedSponsor("monthly");
    const tdb = await getTestDb();

    const res = await changeBillingCycle("season_end");
    expect(res.ok).toBe(true);

    const [sp] = await tdb
      .select()
      .from(sponsors)
      .where(eq(sponsors.id, SPONSOR_ID));
    expect(sp.billingCycle).toBe("season_end");
  });

  it("ungültiger Wert → ok:false", async () => {
    await seedSponsor("monthly");
    const res = await changeBillingCycle("weekly" as never);
    expect(res.ok).toBe(false);
  });
});
