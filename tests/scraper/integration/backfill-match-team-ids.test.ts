/**
 * Integration test: team-id-Backfill + Seiten-Audit gegen die Test-DB.
 *
 * Deckt den End-to-End-Pfad aus lib/inngest/functions/backfill-match-team-ids.ts
 * ab (ohne echten Scrape/Inngest-Steps — Scrape + Emit werden injiziert):
 *   1. Scoping (Part 3): NUR Namens-Kollisions-Matches werden ausgewählt.
 *   2. Backfill (Part 1): NULL-team-ids werden nachgetragen, idempotent.
 *   3. Audit + Remediation (Part 2): Seiten-Flip ⇒ non-invoiced Fehl-Charge
 *      storniert, invoiced Fehl-Charge für die Korrektur-Queue markiert
 *      (correction_flagged_at), match/finished re-emittiert.
 */
import { beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  users,
  clubs,
  teams,
  sponsors,
  pledges,
  pledgeRules,
  matches,
  charges
} from "@/lib/db/schema";
import {
  runTeamIdBackfill,
  selectCollisionCandidates
} from "@/lib/inngest/functions/backfill-match-team-ids";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../../setup/integration-db";

// 30-stellige fussball.de-team-ids (Format wie extractTeamIdFromSection).
const OWN = "011OWN0000000000000000000000000";
const OPP = "011OPP0000000000000000000000000";

const CLUB_NAME = "FC Sportfreunde 1910 Dossenheim";
// Reserve-Derby: unser Team ist die III (GAST), Namens-Matching würde aber den
// Vereins-Token im heimName ("... II") finden und fälschlich HEIM wählen.
const HEIM_NAME = `${CLUB_NAME} II`;
const GAST_NAME = `${CLUB_NAME} III`;

interface Seeded {
  teamId: string;
  collisionMatchId: string;
  distinctMatchId: string;
  pledgeRuleWinId: string;
  pledgeRuleGoalId: string;
}

async function seed(): Promise<Seeded> {
  const db = await getTestDb();
  await db.insert(users).values({ id: "u_bf", email: "bf@example.com" });
  await db.insert(clubs).values({ id: "c_bf", slug: "sf-dossenheim-bf", name: CLUB_NAME });
  const [t] = await db
    .insert(teams)
    .values({
      clubId: "c_bf",
      name: "3. Mannschaft",
      saison: "2526",
      fussballdeTeamId: OWN,
      fussballdeSlug: "sf-dossenheim-3-bf",
      isActive: true
    })
    .returning();
  const [s] = await db
    .insert(sponsors)
    .values({ userId: "u_bf", displayName: "Tante Erna", type: "familie" })
    .returning();
  const [p] = await db
    .insert(pledges)
    .values({
      sponsorId: s.id,
      teamId: t.id,
      status: "active",
      startsAt: new Date("2026-01-01"),
      endsAt: new Date("2099-12-31"),
      monthlyCapCents: null
    })
    .returning();
  const [ruleWin] = await db
    .insert(pledgeRules)
    .values({
      pledgeId: p.id,
      triggerType: "win",
      triggerParamsJson: {},
      amountCents: 1000,
      requiresApproval: false
    })
    .returning();
  const [ruleGoal] = await db
    .insert(pledgeRules)
    .values({
      pledgeId: p.id,
      triggerType: "goal_total",
      triggerParamsJson: {},
      amountCents: 500,
      requiresApproval: false
    })
    .returning();

  // Kollisions-Match: finished, team-ids NULL (Alt-Bestand vor Mig 0065).
  const [mCollision] = await db
    .insert(matches)
    .values({
      teamId: t.id,
      fussballdeSpielId: "SPIEL_COLLISION",
      datum: new Date("2026-05-10T15:00:00Z"),
      heimName: HEIM_NAME,
      gastName: GAST_NAME,
      heimTeamId: null,
      gastTeamId: null,
      ergebnisHeim: 3,
      ergebnisGast: 1,
      status: "finished"
    })
    .returning();

  // Nicht-Kollisions-Match desselben Teams: distinkte Gegnernamen → kein
  // gemeinsamer Token → darf NICHT ausgewählt/gescrapt werden.
  const [mDistinct] = await db
    .insert(matches)
    .values({
      teamId: t.id,
      fussballdeSpielId: "SPIEL_DISTINCT",
      datum: new Date("2026-05-17T15:00:00Z"),
      heimName: "SV Schriesheim",
      gastName: "SG Hohensachsen",
      heimTeamId: null,
      gastTeamId: null,
      ergebnisHeim: 0,
      ergebnisGast: 2,
      status: "finished"
    })
    .returning();

  // Zwei Fehl-Charges auf dem Kollisions-Match: eine bereits fakturiert
  // (invoiced), eine noch nicht (confirmed). Distinkte pledge_rules, damit der
  // Unique-Index (pledgeRuleId, matchId, triggerType, goalIndex) nicht greift.
  await db.insert(charges).values([
    {
      pledgeId: p.id,
      pledgeRuleId: ruleWin.id,
      matchId: mCollision.id,
      triggerType: "win",
      amountCents: 1000,
      status: "invoiced"
    },
    {
      pledgeId: p.id,
      pledgeRuleId: ruleGoal.id,
      matchId: mCollision.id,
      triggerType: "goal_total",
      amountCents: 500,
      status: "confirmed"
    }
  ]);

  return {
    teamId: t.id,
    collisionMatchId: mCollision.id,
    distinctMatchId: mDistinct.id,
    pledgeRuleWinId: ruleWin.id,
    pledgeRuleGoalId: ruleGoal.id
  };
}

// Scrape-Stub: liefert die team-ids so, dass unser Team (OWN) auf der GAST-Seite
// steht → resolveTeamSide="gast", während detectTeamSide (Name) "heim" liefert
// → Flip. Der distinkte Match würde (falls doch gescrapt) auffliegen.
function scrapeStub() {
  const calls: string[] = [];
  return {
    calls,
    scrapeTeamIds: async (spielId: string) => {
      calls.push(spielId);
      if (spielId === "SPIEL_COLLISION") {
        return { heimTeamId: OPP, gastTeamId: OWN };
      }
      return { heimTeamId: null, gastTeamId: null };
    }
  };
}

function emitStub() {
  const emitted: Array<{ matchId: string; teamId: string }> = [];
  return {
    emitted,
    emitMatchFinished: async (matchId: string, teamId: string) => {
      emitted.push({ matchId, teamId });
    }
  };
}

describe.skipIf(isIntegrationDbDisabled)("backfill-match-team-ids", () => {
  beforeEach(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("wählt NUR Kollisions-Matches aus (Part 3-Scoping)", async () => {
    const { collisionMatchId } = await seed();
    const { total, slice } = await selectCollisionCandidates(200);
    expect(total).toBe(1);
    expect(slice.map((m) => m.id)).toEqual([collisionMatchId]);
  });

  it("trägt team-ids nach, storniert/flaggt Fehl-Charges und re-emittiert", async () => {
    const seeded = await seed();
    const db = await getTestDb();
    const scrape = scrapeStub();
    const emit = emitStub();

    const report = await runTeamIdBackfill({
      scrapeTeamIds: scrape.scrapeTeamIds,
      emitMatchFinished: emit.emitMatchFinished
    });

    // Nur der Kollisions-Match wurde gescrapt (der distinkte NICHT).
    expect(scrape.calls).toEqual(["SPIEL_COLLISION"]);

    // Report.
    expect(report).toMatchObject({
      candidatesTotal: 1,
      processed: 1,
      truncated: false,
      idsFilled: 1,
      flips: 1,
      remediatedMatches: 1,
      chargesCancelled: 1,
      chargesFlaggedInvoiced: 1,
      errors: 0
    });

    // team-ids nachgetragen.
    const [m] = await db.select().from(matches).where(eq(matches.id, seeded.collisionMatchId));
    expect(m.heimTeamId).toBe(OPP);
    expect(m.gastTeamId).toBe(OWN);

    // confirmed → cancelled; invoiced → bleibt invoiced + correction_flagged_at.
    const rows = await db.select().from(charges).where(eq(charges.matchId, seeded.collisionMatchId));
    const win = rows.find((c) => c.pledgeRuleId === seeded.pledgeRuleWinId)!;
    const goal = rows.find((c) => c.pledgeRuleId === seeded.pledgeRuleGoalId)!;
    expect(win.status).toBe("invoiced");
    expect(win.correctionFlaggedAt).not.toBeNull();
    expect(goal.status).toBe("cancelled");
    expect(goal.cancelledReason).toBe("team_side_corrected");

    // match/finished für die Neuberechnung re-emittiert.
    expect(emit.emitted).toEqual([
      { matchId: seeded.collisionMatchId, teamId: seeded.teamId }
    ]);
  });

  it("ist idempotent: zweiter Lauf findet keinen Kandidaten mehr", async () => {
    await seed();
    const scrape = scrapeStub();
    const emit = emitStub();

    await runTeamIdBackfill({
      scrapeTeamIds: scrape.scrapeTeamIds,
      emitMatchFinished: emit.emitMatchFinished
    });
    const second = await runTeamIdBackfill({
      scrapeTeamIds: scrape.scrapeTeamIds,
      emitMatchFinished: emit.emitMatchFinished
    });

    expect(second.processed).toBe(0);
    expect(second.candidatesTotal).toBe(0);
    // kein zweiter Scrape, keine zweite Remediation.
    expect(scrape.calls).toEqual(["SPIEL_COLLISION"]);
    expect(emit.emitted).toHaveLength(1);
  });
});
