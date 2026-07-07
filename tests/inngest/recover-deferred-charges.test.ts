/**
 * Deferred-Charge-Recovery nach Reaktivierung eines past_due-Vereins.
 *
 * Bug: past_due jenseits der Grace ist read-only, wird aber WEITER gecrawlt
 * (isCrawlBlockedByGate blockt nur cancelled). Spiele werden mit korrektem
 * contentHash persistiert, evaluate-match stellt die Charges nur zurück
 * (match/evaluation-deferred) — es entstehen KEINE Charge-Rows. Der
 * dokumentierte Recovery-Weg „Spieldaten erneut einlesen" ist für diese Spiele
 * ein No-Op: crawl-matches überspringt sie bei unverändertem Hash und emittet
 * kein match/finished. Die zurückgestellten Charges gingen still verloren.
 *
 * Fix (Bounded Recovery): billing/charges.recover re-emittet match/finished
 * gezielt für die GESPIELTEN Spiele der letzten DEFERRED_CHARGE_RECOVERY_DAYS
 * Tage aller Mannschaften unter der EFFEKTIVEN Lizenz des Vereins. Fenster
 * bewusst begrenzt (Cap-Crush-Schutz); ältere deferred Charges verfallen.
 *
 * Integration gegen die Docker-Test-DB; Inngest-Handler via `.fn` mit
 * Step-Stub (run + sendEvent), Pattern aus evaluate-match-money.test.ts.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
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
  charges
} from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import {
  recoverDeferredCharges,
  DEFERRED_CHARGE_RECOVERY_DAYS
} from "@/lib/inngest/functions/recover-deferred-charges";
import { evaluateMatch } from "@/lib/inngest/functions/evaluate-match";

const loggerStub = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

function createStepStub() {
  const sendEvent = vi.fn(async () => {});
  return {
    stub: {
      run: async <T>(_label: string, fn: () => Promise<T> | T): Promise<T> => fn(),
      sendEvent
    },
    sendEvent
  };
}

async function runRecovery(clubId: string) {
  const { stub, sendEvent } = createStepStub();
  const fn = (recoverDeferredCharges as unknown as {
    fn: (ctx: {
      step: typeof stub;
      logger: typeof loggerStub;
      event: { data: { clubId: string } };
    }) => Promise<{ clubId: string; reEmitted: number }>;
  }).fn;
  const result = await fn({ step: stub, logger: loggerStub, event: { data: { clubId } } });
  // Alle re-emitteten matchIds aus den sendEvent-Calls extrahieren.
  const emittedMatchIds = sendEvent.mock.calls.map(
    (c) => (c[1] as { data: { matchId: string } }).data.matchId
  );
  return { result, emittedMatchIds, sendEvent };
}

async function runEvaluateMatch(matchId: string, teamId: string) {
  const fn = (evaluateMatch as unknown as {
    fn: (ctx: {
      step: { run: <T>(l: string, f: () => Promise<T> | T) => Promise<T> };
      logger: typeof loggerStub;
      event: { data: { matchId: string; teamId: string } };
    }) => Promise<{ inserted: number; skippedReadOnly?: boolean }>;
  }).fn;
  return fn({
    step: { run: async (_l, f) => f() },
    logger: loggerStub,
    event: { data: { matchId, teamId } }
  });
}

const DAY = 24 * 60 * 60 * 1000;

/** Finished-Match für ein Team, `daysAgo` Tage in der Vergangenheit, mit `goals` Heim-Toren. */
async function seedFinishedMatch(
  teamId: string,
  suffix: string,
  daysAgo: number,
  goals = 1
) {
  const db = await getTestDb();
  const [m] = await db
    .insert(matches)
    .values({
      teamId,
      fussballdeSpielId: `fs_rec_${suffix}`,
      datum: new Date(Date.now() - daysAgo * DAY),
      heimName: "Recovery FC",
      gastName: "SV Gegner",
      ergebnisHeim: goals,
      ergebnisGast: 0,
      status: "finished"
    })
    .returning();
  for (let i = 0; i < goals; i++) {
    await db.insert(matchEvents).values({
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

describe.skipIf(isIntegrationDbDisabled)("recover-deferred-charges", () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("re-emittet nur junge Spiele (innerhalb des Fensters) — Cap-Crush-Schutz", async () => {
    const db = await getTestDb();
    await db.insert(clubs).values({ id: "c_rec", slug: "rec-fc", name: "Recovery FC" });
    const [team] = await db
      .insert(teams)
      .values({
        clubId: "c_rec",
        name: "1. Herren",
        saison: "2526",
        fussballdeTeamId: "TEAM_REC",
        fussballdeSlug: "rec-fc-1",
        isActive: true
      })
      .returning();

    const youngId = await seedFinishedMatch(team.id, "young", 2);
    const oldId = await seedFinishedMatch(team.id, "old", DEFERRED_CHARGE_RECOVERY_DAYS + 5);

    const { result, emittedMatchIds } = await runRecovery("c_rec");

    expect(result.reEmitted).toBe(1);
    expect(emittedMatchIds).toContain(youngId);
    expect(emittedMatchIds).not.toContain(oldId);
  });

  it("scoped auf die EFFEKTIVE Lizenz — lizenz-transferiertes Team zählt, Fremd-Team nicht", async () => {
    const db = await getTestDb();
    await db.insert(clubs).values([
      { id: "c_lic", slug: "lic-fc", name: "Lizenz-Verein" },
      { id: "c_container", slug: "container-fc", name: "Container" },
      { id: "c_other", slug: "other-fc", name: "Fremd" }
    ]);
    // Team unter eigenem Verein.
    const [own] = await db
      .insert(teams)
      .values({
        clubId: "c_lic",
        name: "Eigen",
        saison: "2526",
        fussballdeTeamId: "T_OWN",
        fussballdeSlug: "lic-own",
        isActive: true
      })
      .returning();
    // Team im gekündigten Container, aber unter der Lizenz von c_lic.
    const [transferred] = await db
      .insert(teams)
      .values({
        clubId: "c_container",
        licensedUnderClubId: "c_lic",
        name: "Transfer",
        saison: "2526",
        fussballdeTeamId: "T_TRANSFER",
        fussballdeSlug: "lic-transfer",
        isActive: true
      })
      .returning();
    // Fremd-Team unter anderem Verein.
    const [foreign] = await db
      .insert(teams)
      .values({
        clubId: "c_other",
        name: "Fremd",
        saison: "2526",
        fussballdeTeamId: "T_OTHER",
        fussballdeSlug: "other-1",
        isActive: true
      })
      .returning();

    const ownMatch = await seedFinishedMatch(own.id, "own", 3);
    const transferMatch = await seedFinishedMatch(transferred.id, "transfer", 3);
    const foreignMatch = await seedFinishedMatch(foreign.id, "foreign", 3);

    const { result, emittedMatchIds } = await runRecovery("c_lic");

    expect(result.reEmitted).toBe(2);
    expect(emittedMatchIds).toEqual(expect.arrayContaining([ownMatch, transferMatch]));
    expect(emittedMatchIds).not.toContain(foreignMatch);
  });

  it("End-to-End: zurückgestellte Charge entsteht nach Recovery→evaluate, alte verfällt", async () => {
    const db = await getTestDb();
    await db.insert(users).values({ id: "u_rec", email: "rec@example.com" });
    await db.insert(clubs).values({ id: "c_e2e", slug: "e2e-fc", name: "Recovery FC" });
    // Verein ist nach der Zahlung wieder active → Geld-Gate lässt Charges durch.
    await db.insert(subscriptions).values({
      clubId: "c_e2e",
      stripeCustomerId: "cus_e2e",
      status: "active"
    });
    const [team] = await db
      .insert(teams)
      .values({
        clubId: "c_e2e",
        name: "1. Herren",
        saison: "2526",
        fussballdeTeamId: "TEAM_E2E",
        fussballdeSlug: "e2e-fc-1",
        isActive: true
      })
      .returning();
    const [sponsor] = await db
      .insert(sponsors)
      .values({ userId: "u_rec", displayName: "Onkel Cap", type: "familie" })
      .returning();
    const [pledge] = await db
      .insert(pledges)
      .values({
        sponsorId: sponsor.id,
        teamId: team.id,
        status: "active",
        startsAt: new Date(Date.now() - 60 * DAY),
        endsAt: new Date(Date.now() + 60 * DAY),
        monthlyCapCents: null
      })
      .returning();
    await db.insert(pledgeRules).values({
      pledgeId: pledge.id,
      triggerType: "goal_total",
      triggerParamsJson: {},
      amountCents: 600,
      requiresApproval: false
    });

    // Während des Lapse gespielt (deferred, noch KEINE Charge) — jung + alt.
    const youngMatch = await seedFinishedMatch(team.id, "e2e-young", 2, 1);
    await seedFinishedMatch(team.id, "e2e-old", DEFERRED_CHARGE_RECOVERY_DAYS + 5, 1);

    // Vorbedingung: keine Charges (past_due hatte alles zurückgestellt).
    expect(await db.select().from(charges)).toHaveLength(0);

    const { emittedMatchIds } = await runRecovery("c_e2e");
    for (const matchId of emittedMatchIds) {
      await runEvaluateMatch(matchId, team.id);
    }

    const allCharges = await db.select().from(charges);
    expect(allCharges).toHaveLength(1);
    expect(allCharges[0].matchId).toBe(youngMatch);
  });

  it("idempotent: bereits fakturiertes junges Spiel erzeugt keine Doppel-Charge", async () => {
    const db = await getTestDb();
    await db.insert(users).values({ id: "u_idem", email: "idem@example.com" });
    // Club-Name muss den Heim-Namen der Seed-Matches enthalten, sonst erkennt
    // detectTeamSide das Team als Gast (0 Tore) und goal_total feuert nie.
    await db.insert(clubs).values({ id: "c_idem", slug: "idem-fc", name: "Recovery FC" });
    await db.insert(subscriptions).values({
      clubId: "c_idem",
      stripeCustomerId: "cus_idem",
      status: "active"
    });
    const [team] = await db
      .insert(teams)
      .values({
        clubId: "c_idem",
        name: "1. Herren",
        saison: "2526",
        fussballdeTeamId: "TEAM_IDEM",
        fussballdeSlug: "idem-fc-1",
        isActive: true
      })
      .returning();
    const [sponsor] = await db
      .insert(sponsors)
      .values({ userId: "u_idem", displayName: "Tante Cap", type: "familie" })
      .returning();
    const [pledge] = await db
      .insert(pledges)
      .values({
        sponsorId: sponsor.id,
        teamId: team.id,
        status: "active",
        startsAt: new Date(Date.now() - 60 * DAY),
        endsAt: new Date(Date.now() + 60 * DAY)
      })
      .returning();
    await db.insert(pledgeRules).values({
      pledgeId: pledge.id,
      triggerType: "goal_total",
      triggerParamsJson: {},
      amountCents: 600,
      requiresApproval: false
    });
    const matchId = await seedFinishedMatch(team.id, "idem", 2, 1);

    // Erst-Auswertung (Match wurde regulär fakturiert), DANN Recovery+Re-Eval.
    await runEvaluateMatch(matchId, team.id);
    const { emittedMatchIds } = await runRecovery("c_idem");
    for (const id of emittedMatchIds) await runEvaluateMatch(id, team.id);

    const allCharges = await db
      .select()
      .from(charges)
      .where(eq(charges.matchId, matchId));
    expect(allCharges).toHaveLength(1);
  });
});
