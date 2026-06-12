/**
 * Paket A.2 (Spec 2026-05-26 §1.2) — Snapshot des Billing-Cycles beim
 * Charge-Insert.
 *
 * Alle drei Insert-Pfade frieren `charges.billingCycleSnapshot` über
 * `resolveCycleAt(sponsorId, <Zeitpunkt>)` ein:
 *  - evaluate-match    → SPIELdatum (matches.datum)
 *  - addManualEvent    → SPIELdatum des Matches
 *  - evaluate-season   → Saisonende (parseSeasonBoundaries(saison).end)
 *
 * Damit gehört eine rückwirkend evaluierte Charge dem Cycle, der zum
 * Spielzeitpunkt galt — nicht dem aktuellen.
 *
 * Integration gegen die Docker-Test-DB (DATABASE_URL_TEST).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "u_bcs", email: "bcs@example.com" })
}));
vi.mock("@/lib/auth/scope", () => ({
  assertClubWriteAccess: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));
vi.mock("@/lib/mail/client", () => ({
  resend: { emails: { send: vi.fn().mockResolvedValue({ id: "stub", error: null }) } },
  MAIL_FROM: "KickPact <stub@test.local>"
}));

import {
  users,
  clubs,
  teams,
  sponsors,
  sponsorBillingCycleHistory,
  subscriptions,
  pledges,
  pledgeRules,
  matches,
  matchEvents,
  charges,
  seasonResults
} from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import { evaluateMatch } from "@/lib/inngest/functions/evaluate-match";
import { runEvaluateSeason } from "@/lib/inngest/functions/evaluate-season";
import { addManualEvent } from "@/lib/actions/match-events";

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
    }) => Promise<{ inserted: number }>;
  }).fn;
  return fn({
    step: createStepStub(),
    logger: loggerStub,
    event: { data: { matchId, teamId } }
  });
}

const MATCH_DATE = new Date("2026-05-10T13:00:00Z");

/**
 * Seed: Sponsor mit Cycle-History — monthly ab Erstellung, season_end ab
 * `switchAt` (optional). Liefert IDs für Match-/Manual-/Saison-Pfade.
 */
async function seedBase(opts: {
  currentCycle?: "monthly" | "season_end";
  /** History: season_end gilt ab diesem Zeitpunkt. */
  seasonEndFrom?: Date;
  requiresApproval?: boolean;
}) {
  const tdb = await getTestDb();
  await tdb.insert(users).values({ id: "u_bcs", email: "bcs@example.com" });
  await tdb.insert(clubs).values({ id: "c_bcs", slug: "bcs-fc", name: "Snapshot FC" });
  await tdb.insert(subscriptions).values({
    clubId: "c_bcs",
    stripeCustomerId: "cus_bcs",
    status: "active"
  });
  const [team] = await tdb
    .insert(teams)
    .values({
      clubId: "c_bcs",
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: "TEAM_BCS",
      fussballdeSlug: "bcs-fc-1",
      isActive: true
    })
    .returning();
  const createdAt = new Date("2025-07-01T00:00:00Z");
  const [sponsor] = await tdb
    .insert(sponsors)
    .values({
      userId: "u_bcs",
      displayName: "Cycle-Onkel",
      type: "familie",
      billingCycle: opts.currentCycle ?? "monthly",
      createdAt
    })
    .returning();
  if (opts.seasonEndFrom) {
    await tdb.insert(sponsorBillingCycleHistory).values([
      { sponsorId: sponsor.id, cycle: "monthly", validFrom: createdAt },
      { sponsorId: sponsor.id, cycle: "season_end", validFrom: opts.seasonEndFrom }
    ]);
  }
  const [pledge] = await tdb
    .insert(pledges)
    .values({
      sponsorId: sponsor.id,
      teamId: team.id,
      status: "active",
      startsAt: new Date("2025-08-01T00:00:00Z"),
      endsAt: new Date("2026-06-30T23:59:59Z")
    })
    .returning();
  const [goalRule] = await tdb
    .insert(pledgeRules)
    .values({
      pledgeId: pledge.id,
      triggerType: "goal_total",
      triggerParamsJson: {},
      amountCents: 500,
      requiresApproval: opts.requiresApproval ?? false
    })
    .returning();
  const [seasonRule] = await tdb
    .insert(pledgeRules)
    .values({
      pledgeId: pledge.id,
      triggerType: "season_promotion",
      triggerParamsJson: {},
      amountCents: 5000,
      requiresApproval: false
    })
    .returning();
  return {
    teamId: team.id,
    sponsorId: sponsor.id,
    pledgeId: pledge.id,
    goalRuleId: goalRule.id,
    seasonRuleId: seasonRule.id
  };
}

async function seedMatch(teamId: string, goals: number) {
  const tdb = await getTestDb();
  const [m] = await tdb
    .insert(matches)
    .values({
      teamId,
      fussballdeSpielId: "fs_bcs_1",
      datum: MATCH_DATE,
      heimName: "Snapshot FC",
      gastName: "SV Gegner",
      ergebnisHeim: goals,
      ergebnisGast: 0,
      status: "finished"
    })
    .returning();
  for (let i = 0; i < goals; i++) {
    await tdb.insert(matchEvents).values({
      matchId: m.id,
      minute: 10 + i,
      type: "tor",
      side: "heim",
      playerName: `Spieler ${i + 1}`,
      source: "scraped"
    });
  }
  return m.id;
}

describe.skipIf(isIntegrationDbDisabled)("billingCycleSnapshot beim Insert", () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("evaluate-match: Cycle zum SPIELdatum — season_end galt am 10.5.", async () => {
    const tdb = await getTestDb();
    const seeded = await seedBase({
      currentCycle: "season_end",
      seasonEndFrom: new Date("2026-04-01T00:00:00Z")
    });
    const matchId = await seedMatch(seeded.teamId, 2);

    const res = await runEvaluateMatch(matchId, seeded.teamId);
    expect(res.inserted).toBe(2);

    const rows = await tdb.select().from(charges);
    expect(rows).toHaveLength(2);
    for (const c of rows) expect(c.billingCycleSnapshot).toBe("season_end");
  });

  it("evaluate-match: Wechsel NACH Spieldatum → Snapshot bleibt monthly", async () => {
    const tdb = await getTestDb();
    // Sponsor ist heute season_end, der Wechsel kam aber erst am 1.6. —
    // das Mai-Spiel gehört noch dem monthly-Cycle.
    const seeded = await seedBase({
      currentCycle: "season_end",
      seasonEndFrom: new Date("2026-06-01T00:00:00Z")
    });
    const matchId = await seedMatch(seeded.teamId, 1);

    await runEvaluateMatch(matchId, seeded.teamId);

    const [c] = await tdb.select().from(charges);
    expect(c.billingCycleSnapshot).toBe("monthly");
  });

  it("addManualEvent: Snapshot über das SPIELdatum des Matches", async () => {
    const tdb = await getTestDb();
    const seeded = await seedBase({
      currentCycle: "season_end",
      seasonEndFrom: new Date("2026-04-01T00:00:00Z")
    });
    const matchId = await seedMatch(seeded.teamId, 1);
    // Kein Tor-Event geseedet fürs zweite Tor? Doch: ergebnisHeim=1 und 1 Event.
    // Wir tragen einen Karten-Nachtrag ein? Karten haben keine Rule — stattdessen
    // erhöhen wir den Score auf 2, damit das manuelle Tor unter H3 durchgeht.
    await tdb
      .update(matches)
      .set({ ergebnisHeim: 2 })
      .where(eq(matches.id, matchId));

    const res = await addManualEvent({
      matchId,
      minute: 80,
      type: "tor",
      side: "heim",
      playerName: "Nachtrag"
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.charges).toBe(1);

    const rows = await tdb.select().from(charges);
    expect(rows).toHaveLength(1);
    expect(rows[0].billingCycleSnapshot).toBe("season_end");
  });

  it("evaluate-season: Snapshot über das Saisonende (30.6.)", async () => {
    const tdb = await getTestDb();
    // Wechsel auf season_end am 1.6.2026 — das Saisonende (30.6.) liegt
    // danach, die Saison-Charge gehört also dem season_end-Cycle.
    const seeded = await seedBase({
      currentCycle: "season_end",
      seasonEndFrom: new Date("2026-06-01T00:00:00Z")
    });
    await tdb.insert(seasonResults).values({
      teamId: seeded.teamId,
      saison: "2526",
      promoted: true,
      evaluatedAt: new Date("2026-06-20T00:00:00Z")
    });

    const res = await runEvaluateSeason({ teamId: seeded.teamId, saison: "2526" });
    expect(res.chargesCreated).toBe(1);

    const rows = await tdb
      .select()
      .from(charges)
      .where(eq(charges.saison, "2526"));
    expect(rows).toHaveLength(1);
    expect(rows[0].billingCycleSnapshot).toBe("season_end");
  });

  it("evaluate-season: Wechsel erst NACH Saisonende → monthly", async () => {
    const tdb = await getTestDb();
    const seeded = await seedBase({
      currentCycle: "season_end",
      seasonEndFrom: new Date("2026-08-15T00:00:00Z")
    });
    await tdb.insert(seasonResults).values({
      teamId: seeded.teamId,
      saison: "2526",
      promoted: true,
      evaluatedAt: new Date("2026-06-20T00:00:00Z")
    });

    await runEvaluateSeason({ teamId: seeded.teamId, saison: "2526" });

    const rows = await tdb
      .select()
      .from(charges)
      .where(eq(charges.saison, "2526"));
    expect(rows[0].billingCycleSnapshot).toBe("monthly");
  });
});
