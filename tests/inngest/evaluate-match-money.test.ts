/**
 * Geld-Integrität der evaluate-match-Pipeline (Audit 2026-06-11 / Phase 2).
 *
 * B1 — Monats-Cap-Anker = ABRECHNUNGSmonat (Monat des Inserts/Confirms), nicht
 *      Spielmonat. Vorher: Fenster nach Spieldatum, Summe nach Confirm-Zeit →
 *      zwei spät gescrapte Vormonats-Spiele konnten zusammen 2× den Cap auf
 *      EINER Rechnung erzeugen.
 * B3 — Read-Only-Gate verwirft nur noch bei past_due/cancelled (mit Log),
 *      paused (Saison-Pass-Sommerpause) chargt weiter — die Saison läuft
 *      bis 30.6.
 * B4 — Charge-Insert mit requiresApproval+matchEventId stellt eine fehlende
 *      eventApprovals-Row wieder her (Re-Eval nach Invalidate).
 *
 * Integration gegen die Docker-Test-DB; Inngest-Handler via `.fn` mit
 * Step-Stub (Pattern aus generate-invoices-season.test.ts).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  users,
  clubs,
  teams,
  sponsors,
  subscriptions,
  pledges,
  pledgeRules,
  matches,
  matchEvents,
  charges,
  eventApprovals
} from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import { evaluateMatch } from "@/lib/inngest/functions/evaluate-match";

function createStepStub() {
  return {
    run: async <T>(_label: string, fn: () => Promise<T> | T): Promise<T> => fn()
  };
}

const loggerStub = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

async function runEvaluateMatch(matchId: string, teamId: string) {
  const fn = (evaluateMatch as unknown as {
    fn: (ctx: {
      step: ReturnType<typeof createStepStub>;
      logger: typeof loggerStub;
      event: { data: { matchId: string; teamId: string } };
    }) => Promise<{
      proposals: number;
      inserted: number;
      cappedOrSkipped: number;
      skippedReadOnly?: boolean;
    }>;
  }).fn;
  return fn({
    step: createStepStub(),
    logger: loggerStub,
    event: { data: { matchId, teamId } }
  });
}

interface SeedOpts {
  monthlyCapCents?: number | null;
  subscriptionStatus?: "active" | "paused" | "past_due" | "cancelled";
  pastDueSince?: Date | null;
  ruleAmountCents?: number;
}

async function seedBase(opts: SeedOpts = {}) {
  const db = await getTestDb();
  await db.insert(users).values({ id: "u_em", email: "em@example.com" });
  await db.insert(clubs).values({ id: "c_em", slug: "em-fc", name: "Evaluierung FC" });
  await db.insert(subscriptions).values({
    clubId: "c_em",
    stripeCustomerId: "cus_em",
    status: opts.subscriptionStatus ?? "active",
    pastDueSince: opts.pastDueSince ?? null
  });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: "c_em",
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: "TEAM_EM",
      fussballdeSlug: "em-fc-1",
      isActive: true
    })
    .returning();
  const [sponsor] = await db
    .insert(sponsors)
    .values({ userId: "u_em", displayName: "Onkel Cap", type: "familie" })
    .returning();
  const [pledge] = await db
    .insert(pledges)
    .values({
      sponsorId: sponsor.id,
      teamId: team.id,
      status: "active",
      startsAt: new Date("2025-08-01T00:00:00Z"),
      endsAt: new Date("2026-06-30T23:59:59Z"),
      monthlyCapCents: opts.monthlyCapCents ?? null
    })
    .returning();
  const [rule] = await db
    .insert(pledgeRules)
    .values({
      pledgeId: pledge.id,
      triggerType: "goal_total",
      triggerParamsJson: {},
      amountCents: opts.ruleAmountCents ?? 600,
      requiresApproval: false
    })
    .returning();
  return { teamId: team.id, pledgeId: pledge.id, ruleId: rule.id };
}

/** Spiel im Mai (Vormonat) mit `goals` eigenen (Heim-)Toren, Quelle scraped. */
async function seedMayMatch(
  teamId: string,
  suffix: string,
  goals: number,
  source: "scraped" | "manual" = "scraped"
) {
  const db = await getTestDb();
  const [m] = await db
    .insert(matches)
    .values({
      teamId,
      fussballdeSpielId: `fs_em_${suffix}`,
      datum: new Date("2026-05-10T13:00:00Z"),
      heimName: "Evaluierung FC",
      gastName: "SV Gegner",
      ergebnisHeim: goals,
      ergebnisGast: 0,
      status: "finished"
    })
    .returning();
  const eventIds: string[] = [];
  for (let i = 0; i < goals; i++) {
    const [ev] = await db
      .insert(matchEvents)
      .values({
        matchId: m.id,
        minute: 10 + i,
        type: "tor",
        side: "heim",
        playerName: `Spieler ${i + 1}`,
        source
      })
      .returning();
    eventIds.push(ev.id);
  }
  return { matchId: m.id, eventIds };
}

describe.skipIf(isIntegrationDbDisabled)("evaluate-match Geld-Integrität", () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("B1: Monats-Cap ankert am Abrechnungsmonat — zwei spät evaluierte Mai-Spiele teilen sich EINEN Cap", async () => {
    const db = await getTestDb();
    // Cap 1000, Regel 600 → nur EINE der beiden Mai-Charges passt in den
    // aktuellen Abrechnungsmonat (beide werden JETZT confirmed).
    const { teamId } = await seedBase({ monthlyCapCents: 1000, ruleAmountCents: 600 });
    const m1 = await seedMayMatch(teamId, "1", 1);
    const m2 = await seedMayMatch(teamId, "2", 1);

    const r1 = await runEvaluateMatch(m1.matchId, teamId);
    const r2 = await runEvaluateMatch(m2.matchId, teamId);

    expect(r1.inserted).toBe(1);
    expect(r2.inserted).toBe(0);
    expect(r2.cappedOrSkipped).toBe(1);

    const allCharges = await db.select().from(charges);
    expect(allCharges).toHaveLength(1);
  });

  it("B3: paused (Sommerpause) erzeugt weiterhin Charges", async () => {
    const db = await getTestDb();
    const { teamId } = await seedBase({ subscriptionStatus: "paused" });
    const m = await seedMayMatch(teamId, "p", 2);

    const result = await runEvaluateMatch(m.matchId, teamId);

    expect(result.skippedReadOnly).toBeFalsy();
    expect(result.inserted).toBe(2);
    const allCharges = await db.select().from(charges);
    expect(allCharges).toHaveLength(2);
  });

  it("B3: past_due jenseits der Grace → deferred, keine Charges, aber Log", async () => {
    const db = await getTestDb();
    const { teamId } = await seedBase({
      subscriptionStatus: "past_due",
      pastDueSince: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
    });
    const m = await seedMayMatch(teamId, "pd", 1);

    const result = await runEvaluateMatch(m.matchId, teamId);

    expect(result.skippedReadOnly).toBe(true);
    expect(await db.select().from(charges)).toHaveLength(0);
    // match/evaluation-deferred wird geloggt (Admin-Forensik / Re-Emit-Hinweis).
    const logged = [...loggerStub.warn.mock.calls, ...loggerStub.info.mock.calls]
      .flat()
      .some((arg) => typeof arg === "string" && arg.includes("evaluation-deferred"));
    expect(logged).toBe(true);
  });

  it("B3: cancelled → deferred, keine Charges", async () => {
    const db = await getTestDb();
    const { teamId } = await seedBase({ subscriptionStatus: "cancelled" });
    const m = await seedMayMatch(teamId, "ca", 1);

    const result = await runEvaluateMatch(m.matchId, teamId);

    expect(result.skippedReadOnly).toBe(true);
    expect(await db.select().from(charges)).toHaveLength(0);
  });

  it("B4: Re-Eval nach Invalidate stellt fehlende eventApprovals-Row wieder her", async () => {
    const db = await getTestDb();
    const { teamId, ruleId } = await seedBase({});
    // Manuelles Tor → goal_total feuert mit requiresApproval=true (C1).
    const m = await seedMayMatch(teamId, "ap", 1, "manual");

    const r1 = await runEvaluateMatch(m.matchId, teamId);
    expect(r1.inserted).toBe(1);

    const approvalsAfterFirst = await db
      .select()
      .from(eventApprovals)
      .where(
        and(
          eq(eventApprovals.matchEventId, m.eventIds[0]),
          eq(eventApprovals.pledgeRuleId, ruleId)
        )
      );
    expect(approvalsAfterFirst).toHaveLength(1);

    // Invalidate-Szenario: Charge storniert + Approval-Row weg.
    await db
      .update(charges)
      .set({ status: "cancelled", cancelledReason: "match_updated" });
    await db.delete(eventApprovals);

    const r2 = await runEvaluateMatch(m.matchId, teamId);
    expect(r2.inserted).toBe(1);

    const restored = await db
      .select()
      .from(eventApprovals)
      .where(
        and(
          eq(eventApprovals.matchEventId, m.eventIds[0]),
          eq(eventApprovals.pledgeRuleId, ruleId)
        )
      );
    expect(restored).toHaveLength(1);
    expect(restored[0].status).toBe("pending");
  });
});
