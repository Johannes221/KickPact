/**
 * Integration test: season-trigger evaluation against the test DB.
 *
 * Seeds a club + team + sponsor with a season_promotion pledge, inserts a
 * `season_results` row marking the team as promoted, and walks through the
 * same charge-insertion path the inngest function `evaluateSeason` uses:
 *
 *   1. Look up active pledges + season-trigger rules for the team.
 *   2. Apply `isTriggerHit(triggerType, params, result)`.
 *   3. Insert charges with `onConflictDoNothing()` — UNIQUE(pledge_rule_id,
 *      saison) guarantees a single charge per saison even on re-runs.
 *
 * The full `runEvaluateSeason({...})` entry point referenced by the plan is
 * not yet exported from lib/inngest/functions/evaluate-season.ts (Phase 4
 * extraction). The skipped case below stays as a reminder.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { charges, pledges, seasonResults } from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../../setup/integration-db";
import {
  seedClubFromFixture,
  seedSponsorWithPledge
} from "../../fixtures/scraper/seed-from-fixtures";
// Testet die ECHTE Auswertungs-Logik (kein Clone mehr) — der globale `db` zeigt
// unter Vitest auf DATABASE_URL_TEST = dieselbe Test-DB wie getTestDb().
import { runEvaluateSeason } from "@/lib/inngest/functions/evaluate-season";

describe.skipIf(isIntegrationDbDisabled)("evaluate-season", () => {
  beforeEach(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("season_promotion fires once and is idempotent", async () => {
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    const { ruleId } = await seedSponsorWithPledge({
      sponsorKey: "promo",
      teamDbId: teamIds.herren1!,
      triggerType: "season_promotion",
      amountCents: 5000,
      // Pledge muss zur Saison 2425 (endet 30.6.2025) gültig sein.
      startsAt: new Date("2024-08-01T00:00:00Z")
    });
    await db.insert(seasonResults).values({
      teamId: teamIds.herren1!,
      saison: "2425",
      finalPosition: 1,
      teamsInLeague: 16,
      promoted: true,
      relegated: false
    });

    const r1 = await runEvaluateSeason({ teamId: teamIds.herren1!, saison: "2425" });
    expect(r1.chargesCreated).toBe(1);

    let rows = await db.select().from(charges);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.pledgeRuleId).toBe(ruleId);
    expect(rows[0]?.saison).toBe("2425");
    expect(rows[0]?.matchId).toBeNull();
    expect(rows[0]?.status).toBe("confirmed");

    // Second run: UNIQUE(pledge_rule_id, saison) blocks duplicate.
    const r2 = await runEvaluateSeason({ teamId: teamIds.herren1!, saison: "2425" });
    expect(r2.chargesCreated).toBe(0);

    rows = await db.select().from(charges);
    expect(rows).toHaveLength(1);
  });

  it("season_no_relegation: relegated=true → no charge", async () => {
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    await seedSponsorWithPledge({
      sponsorKey: "no-rel",
      teamDbId: teamIds.herren1!,
      triggerType: "season_no_relegation",
      amountCents: 3000
    });
    await db.insert(seasonResults).values({
      teamId: teamIds.herren1!,
      saison: "2425",
      finalPosition: 14,
      relegated: true,
      promoted: false
    });
    const { chargesCreated } = await runEvaluateSeason({ teamId: teamIds.herren1!, saison: "2425" });
    expect(chargesCreated).toBe(0);
  });

  it("season_custom: pending_approval (Sponsor bestätigt direkt auf der Charge, C2)", async () => {
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    await seedSponsorWithPledge({
      sponsorKey: "custom",
      teamDbId: teamIds.herren1!,
      triggerType: "season_custom",
      amountCents: 7500,
      startsAt: new Date("2024-08-01T00:00:00Z")
    });
    await db.insert(seasonResults).values({
      teamId: teamIds.herren1!,
      saison: "2425",
      promoted: false,
      relegated: false,
      customNotes: "Most goals in club history"
    });
    const { chargesCreated } = await runEvaluateSeason({ teamId: teamIds.herren1!, saison: "2425" });
    expect(chargesCreated).toBe(1);
    const [row] = await db.select().from(charges);
    // C2 (Audit 2026-06-11): Das Custom-Ziel ist eine reine Vereins-Behauptung
    // (customNotes) → Sponsor muss bestätigen (confirmSeasonCharge), sonst
    // storniert der 21d-Expiry. Objektive Saison-Trigger bleiben auto-confirm.
    expect(row?.status).toBe("pending_approval");
    expect(row?.confirmedAt).toBeNull();
  });

  // Regression (Audit 2026-06-10): season_cup_round landete vorher als
  // pending_approval ohne Approval-Pfad → Charge hing ewig, wurde nie
  // fakturiert. Jetzt auto-confirmed wie season_custom.
  it("season_cup_round: hit → status=confirmed (kein ewiges pending)", async () => {
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    await seedSponsorWithPledge({
      sponsorKey: "cup",
      teamDbId: teamIds.herren1!,
      triggerType: "season_cup_round",
      triggerParamsJson: { minRound: "halbfinale" },
      amountCents: 15000,
      startsAt: new Date("2024-08-01T00:00:00Z")
    });
    await db.insert(seasonResults).values({
      teamId: teamIds.herren1!,
      saison: "2425",
      promoted: false,
      relegated: false,
      cupRoundReached: "finale"
    });
    const { chargesCreated } = await runEvaluateSeason({ teamId: teamIds.herren1!, saison: "2425" });
    expect(chargesCreated).toBe(1);
    const [row] = await db.select().from(charges);
    expect(row?.triggerType).toBe("season_cup_round");
    expect(row?.status).toBe("confirmed");
    expect(row?.confirmedAt).not.toBeNull();
  });

  // Regression (Audit 2026-06-10): Sommerpause-Cron (1.6.) pausiert ALLE Pledges
  // (status='paused', sommerpause_paused=true) BEVOR der Verein das Saison-
  // Ergebnis einträgt (Saison endet 30.6.). Mit reinem status='active' verlor
  // ein solcher Pledge seine End-of-Season-Charge dauerhaft.
  it("Sommerpause-pausierter Pledge bekommt die Saison-Charge trotzdem", async () => {
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    const { pledgeId } = await seedSponsorWithPledge({
      sponsorKey: "paused-promo",
      teamDbId: teamIds.herren1!,
      triggerType: "season_promotion",
      amountCents: 20000,
      startsAt: new Date("2024-08-01T00:00:00Z")
    });
    // Sommerpause hat zugeschlagen: Pledge ist pausiert + geflaggt.
    await db
      .update(pledges)
      .set({ status: "paused", sommerpausePaused: true })
      .where(eq(pledges.id, pledgeId));

    await db.insert(seasonResults).values({
      teamId: teamIds.herren1!,
      saison: "2425",
      finalPosition: 1,
      teamsInLeague: 16,
      promoted: true,
      relegated: false
    });

    const { chargesCreated } = await runEvaluateSeason({ teamId: teamIds.herren1!, saison: "2425" });
    expect(chargesCreated).toBe(1);
    const [row] = await db.select().from(charges);
    expect(row?.status).toBe("confirmed");
  });

  it("non-season trigger rules are ignored", async () => {
    // A per-match `win` pledge_rule MUST NOT produce a season charge even if
    // the team also won the league.
    const db = await getTestDb();
    const { teamIds } = await seedClubFromFixture("dossenheim");
    await seedSponsorWithPledge({
      sponsorKey: "ignore",
      teamDbId: teamIds.herren1!,
      triggerType: "win",
      amountCents: 1000
    });
    await db.insert(seasonResults).values({
      teamId: teamIds.herren1!,
      saison: "2425",
      finalPosition: 1,
      promoted: true,
      relegated: false
    });
    const { chargesCreated } = await runEvaluateSeason({ teamId: teamIds.herren1!, saison: "2425" });
    expect(chargesCreated).toBe(0);
  });

});
