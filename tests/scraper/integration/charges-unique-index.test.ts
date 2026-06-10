/**
 * Regression: Partial-Unique-Index `charges_unique_match_trigger_idx` +
 * `charges_unique_event_idx` (Voll-Audit 2026-06-09, Bugs 1+2).
 *
 * Bug 1 — results_only-Mannschaften (C/D-Jugend ohne Spielbericht):
 *   `goalTotal` emittiert pro Tor einen Proposal mit matchEventId=null und
 *   identischem Index-Schlüssel (pledge_rule_id, match_id, trigger_type) →
 *   der Index ließ nur EINE Tor-Charge pro Spiel zu. Bei 3:1 entstand 1×
 *   statt 3× der Tor-Betrag. Fix: `goal_index`-Diskriminator (1-basierte
 *   Tor-Nummer, 0 = kein Diskriminator nötig).
 *
 * Bug 2 — Match-Update-Pfad: `invalidateChargesForMatch` setzt Charges nur
 *   auf status='cancelled', die Zeilen blieben im Index → nach jeder
 *   fussball.de-Ergebniskorrektur blockierte die stornierte Zeile den
 *   Re-Insert (z.B. Sieg-Charge nach 2:1→3:1 dauerhaft weg). Fix:
 *   Index-Prädikat um `status != 'cancelled'` erweitert. Gleiches Problem
 *   und gleicher Fix für `charges_unique_event_idx` (manuelle Events
 *   überleben den Re-Crawl mit derselben Event-ID, siehe C2-Kommentar in
 *   lib/db/queries/crawler.ts → deren Charges müssen nach Storno
 *   re-insertbar sein).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  users,
  clubs,
  teams,
  sponsors,
  pledges,
  pledgeRules,
  matches,
  matchEvents,
  charges
} from "@/lib/db/schema";
import { evaluateTriggers, type ChargeProposal, type TriggerType } from "@/lib/crawler/triggers";
import { loadActivePledgeRulesForTeam } from "@/lib/db/queries/evaluation";
import { invalidateChargesForMatch } from "@/lib/db/queries/charges";
import { isUniqueViolation } from "@/lib/db/errors";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../../setup/integration-db";

interface SeededIds {
  teamId: string;
  pledgeId: string;
  matchId: string;
  matchDate: Date;
}

/**
 * Minimaler Seed: Club + Team + Sponsor + Pledge mit konfigurierbaren Rules
 * + EIN Spiel (heim) mit gegebenem Ergebnis — bewusst OHNE Tor-Events
 * (results_only-Szenario), Events legen die Tests bei Bedarf selbst an.
 */
async function seedMatch(opts: {
  ergebnisHeim: number;
  ergebnisGast: number;
  rules: { triggerType: TriggerType; amountCents: number }[];
}): Promise<SeededIds> {
  const db = await getTestDb();
  await db.insert(users).values({ id: "u_uidx", email: "uidx@example.test" });
  await db.insert(clubs).values({ id: "c_uidx", slug: "uidx-fc", name: "Unique FC" });
  const [t] = await db
    .insert(teams)
    .values({
      clubId: "c_uidx",
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: "TEAM_UIDX",
      fussballdeSlug: "uidx-fc-1",
      isActive: true
    })
    .returning();
  const [s] = await db
    .insert(sponsors)
    .values({ userId: "u_uidx", displayName: "Onkel Theo", type: "familie" })
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
  await db.insert(pledgeRules).values(
    opts.rules.map((r) => ({
      pledgeId: p.id,
      triggerType: r.triggerType,
      triggerParamsJson: {},
      amountCents: r.amountCents,
      requiresApproval: false
    }))
  );

  const matchDate = new Date("2026-05-10T15:00:00Z");
  const [m] = await db
    .insert(matches)
    .values({
      teamId: t.id,
      fussballdeSpielId: "SPIEL_UIDX",
      datum: matchDate,
      heimName: "1. Herren",
      gastName: "FC Gegner",
      ergebnisHeim: opts.ergebnisHeim,
      ergebnisGast: opts.ergebnisGast,
      status: "finished"
    })
    .returning();

  return { teamId: t.id, pledgeId: p.id, matchId: m.id, matchDate };
}

async function buildMatchInput(matchId: string) {
  const db = await getTestDb();
  const [m] = await db.select().from(matches).where(eq(matches.id, matchId)).limit(1);
  const events = await db.select().from(matchEvents).where(eq(matchEvents.matchId, matchId));
  return {
    id: m.id,
    teamSide: "heim" as const,
    ergebnisHeim: m.ergebnisHeim ?? 0,
    ergebnisGast: m.ergebnisGast ?? 0,
    halbzeitHeim: m.halbzeitHeim,
    halbzeitGast: m.halbzeitGast,
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      subtype: e.subtype,
      minute: e.minute,
      side: e.side,
      playerName: e.playerName,
      playerId: e.playerId,
      source: e.source
    }))
  };
}

/**
 * Spiegelt den Insert-Pfad von evaluate-match (inkl. Unique-Kollision →
 * skipped). Caps sind hier bewusst außen vor — die Tests prüfen nur die
 * Index-Semantik.
 */
async function insertProposals(
  proposals: ChargeProposal[]
): Promise<{ inserted: number; skipped: number }> {
  const db = await getTestDb();
  let inserted = 0;
  let skipped = 0;
  for (const p of proposals) {
    try {
      await db.insert(charges).values({
        pledgeId: p.pledgeId,
        pledgeRuleId: p.pledgeRuleId,
        matchId: p.matchId,
        matchEventId: p.matchEventId,
        goalIndex: p.goalIndex ?? 0,
        triggerType: p.triggerType,
        amountCents: p.amountCents,
        status: p.requiresApproval ? "pending_approval" : "confirmed",
        confirmedAt: p.requiresApproval ? null : new Date()
      });
      inserted++;
    } catch (e) {
      if (isUniqueViolation(e)) skipped++;
      else throw e;
    }
  }
  return { inserted, skipped };
}

async function evaluateAndInsert(ids: SeededIds) {
  const rules = await loadActivePledgeRulesForTeam(ids.teamId, ids.matchDate);
  const input = await buildMatchInput(ids.matchId);
  const proposals = evaluateTriggers(input, rules);
  return { proposals, ...(await insertProposals(proposals)) };
}

describe.skipIf(isIntegrationDbDisabled)("charges unique-index regressions", () => {
  beforeEach(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("results_only: 3:1 ohne Tor-Events → 3 Tor-Charges, nicht 1", async () => {
    const ids = await seedMatch({
      ergebnisHeim: 3,
      ergebnisGast: 1,
      rules: [
        { triggerType: "goal_total", amountCents: 500 },
        { triggerType: "win", amountCents: 1000 }
      ]
    });

    const { proposals, inserted, skipped } = await evaluateAndInsert(ids);
    expect(proposals).toHaveLength(4); // 3× Tor + 1× Sieg

    // Bug 1: vorher kollabierte der Unique-Index die 3 Tor-Proposals auf 1
    // (inserted=2, skipped=2). Mit goal_index landen alle 4.
    expect(skipped).toBe(0);
    expect(inserted).toBe(4);

    const db = await getTestDb();
    const goalRows = await db
      .select()
      .from(charges)
      .where(and(eq(charges.matchId, ids.matchId), eq(charges.triggerType, "goal_total")));
    expect(goalRows).toHaveLength(3);
    expect(goalRows.reduce((a, c) => a + c.amountCents, 0)).toBe(1500);
  });

  it("results_only: Re-Run ist idempotent (alle Proposals kollidieren)", async () => {
    const ids = await seedMatch({
      ergebnisHeim: 3,
      ergebnisGast: 1,
      rules: [{ triggerType: "goal_total", amountCents: 500 }]
    });

    const first = await evaluateAndInsert(ids);
    expect(first.inserted).toBe(3);

    const second = await evaluateAndInsert(ids);
    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(3);

    const db = await getTestDb();
    expect(
      await db.select().from(charges).where(eq(charges.matchId, ids.matchId))
    ).toHaveLength(3);
  });

  it("Ergebniskorrektur 2:1→3:1 (weiterhin Sieg): Sieg-Charge existiert nach Storno+Re-Eval wieder", async () => {
    const ids = await seedMatch({
      ergebnisHeim: 2,
      ergebnisGast: 1,
      rules: [
        { triggerType: "goal_total", amountCents: 500 },
        { triggerType: "win", amountCents: 1000 }
      ]
    });
    const db = await getTestDb();

    const first = await evaluateAndInsert(ids);
    expect(first.inserted).toBe(3); // 2× Tor + 1× Sieg

    // fussball.de korrigiert auf 3:1 → Update-Pfad: erst stornieren, dann
    // Score updaten, dann neu evaluieren (wie crawl-matches.ts).
    await invalidateChargesForMatch(ids.matchId, "match_updated");
    await db
      .update(matches)
      .set({ ergebnisHeim: 3, ergebnisGast: 1 })
      .where(eq(matches.id, ids.matchId));

    const second = await evaluateAndInsert(ids);
    // Bug 2: vorher blockierten die stornierten Zeilen JEDEN Re-Insert
    // (Sieg-Charge dauerhaft weg). Jetzt: 3× Tor + 1× Sieg frisch insertet.
    expect(second.skipped).toBe(0);
    expect(second.inserted).toBe(4);

    const winRows = await db
      .select()
      .from(charges)
      .where(and(eq(charges.matchId, ids.matchId), eq(charges.triggerType, "win")));
    expect(winRows.filter((c) => c.status === "confirmed")).toHaveLength(1);
    expect(winRows.filter((c) => c.status === "cancelled")).toHaveLength(1);

    const goalRows = await db
      .select()
      .from(charges)
      .where(and(eq(charges.matchId, ids.matchId), eq(charges.triggerType, "goal_total")));
    expect(goalRows.filter((c) => c.status === "confirmed")).toHaveLength(3);
    expect(goalRows.filter((c) => c.status === "cancelled")).toHaveLength(2);
  });

  it("manuelles Event überlebt Re-Crawl: stornierte Event-Charge blockiert Re-Insert nicht", async () => {
    const ids = await seedMatch({
      ergebnisHeim: 1,
      ergebnisGast: 0,
      rules: [{ triggerType: "special_goal", amountCents: 700 }]
    });
    const db = await getTestDb();

    // Manuell gemeldetes Spezialtor — überlebt einen Re-Crawl mit DERSELBEN
    // Event-ID (updateMatchWithEvents löscht nur source='scraped').
    await db.insert(matchEvents).values({
      matchId: ids.matchId,
      type: "spezial",
      subtype: "freistosstor",
      side: "heim",
      playerName: "X",
      source: "manual"
    });

    const first = await evaluateAndInsert(ids);
    expect(first.inserted).toBe(1);

    // Re-Crawl: Charges stornieren, Match-Daten ändern sich, manuelles Event
    // bleibt → Re-Evaluation emittiert denselben (pledge_rule, event)-Schlüssel.
    await invalidateChargesForMatch(ids.matchId, "match_updated");

    const second = await evaluateAndInsert(ids);
    expect(second.skipped).toBe(0);
    expect(second.inserted).toBe(1);

    const rows = await db
      .select()
      .from(charges)
      .where(eq(charges.matchId, ids.matchId));
    expect(rows.filter((c) => c.status === "pending_approval")).toHaveLength(1);
    expect(rows.filter((c) => c.status === "cancelled")).toHaveLength(1);
  });
});
