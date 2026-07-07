/**
 * Geld-Integrität von addManualEvent (Audit 2026-06-11 / Phase 2).
 *
 * B2 — results_only-Doppel-Charge: existieren für (pledgeRuleId, matchId)
 *      bereits ANONYME Auto-Charges (matchEventId IS NULL, status<>cancelled),
 *      ist die Tor-Gesamtmenge schon bezahlt → ein manuell nachgetragener
 *      Torschütze darf KEIN zweites goal_total-Proposal erzeugen.
 *      Spieler-bezogene Rules (goal_by_player) feuern weiterhin.
 * B5 — Cap-Check läuft in der Insert-Transaktion (tx statt db): zwei
 *      Proposals desselben Events sehen einander beim Monats-Cap.
 * B7 — Manuelle tor-Events auf nicht-beendeten Spielen erzeugen keine
 *      Sofort-Proposals (Charges entstehen beim finished-Übergang).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "u_mea", email: "mea@example.com" })
}));
vi.mock("@/lib/auth/scope", () => ({
  assertTeamWriteAccess: vi.fn().mockResolvedValue({
    access: { granted: true, scope: "club" }
  })
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

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
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import { addManualEvent } from "@/lib/actions/match-events";

/** B3-Folge: addManualEvent liefert jetzt eine {ok}-Union — hier narrowen. */
function expectOk(r: Awaited<ReturnType<typeof addManualEvent>>) {
  if (!r.ok) throw new Error(`addManualEvent unerwartet abgelehnt: ${r.message}`);
  return r;
}

interface SeedResult {
  teamId: string;
  pledgeId: string;
  goalTotalRuleId: string;
  matchId: string;
}

async function seedBase(opts: {
  matchStatus?: "scheduled" | "finished";
  score?: [number, number];
  monthlyCapCents?: number | null;
  extraPlayerRule?: string;
}): Promise<SeedResult> {
  const db = await getTestDb();
  await db.insert(users).values({ id: "u_mea", email: "mea@example.com" });
  await db.insert(clubs).values({ id: "c_mea", slug: "mea-fc", name: "Manuell FC" });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: "c_mea",
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: "TEAM_MEA",
      fussballdeSlug: "mea-fc-1",
      isActive: true
    })
    .returning();
  const [sponsor] = await db
    .insert(sponsors)
    .values({ userId: "u_mea", displayName: "Tante Cap", type: "familie" })
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
  const [goalRule] = await db
    .insert(pledgeRules)
    .values({
      pledgeId: pledge.id,
      triggerType: "goal_total",
      triggerParamsJson: {},
      amountCents: 600,
      requiresApproval: false
    })
    .returning();
  if (opts.extraPlayerRule) {
    await db.insert(pledgeRules).values({
      pledgeId: pledge.id,
      triggerType: "goal_by_player",
      triggerParamsJson: { playerName: opts.extraPlayerRule },
      amountCents: 600,
      requiresApproval: false
    });
  }
  const [score0, score1] = opts.score ?? [2, 0];
  const [match] = await db
    .insert(matches)
    .values({
      teamId: team.id,
      fussballdeSpielId: "fs_mea_1",
      datum: new Date("2026-06-07T13:00:00Z"),
      heimName: "Manuell FC",
      gastName: "SV Gegner",
      ergebnisHeim: opts.matchStatus === "scheduled" ? null : score0,
      ergebnisGast: opts.matchStatus === "scheduled" ? null : score1,
      status: opts.matchStatus ?? "finished"
    })
    .returning();
  return {
    teamId: team.id,
    pledgeId: pledge.id,
    goalTotalRuleId: goalRule.id,
    matchId: match.id
  };
}

describe.skipIf(isIntegrationDbDisabled)("addManualEvent Geld-Integrität", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("B2: anonyme results_only-Charges vorhanden → kein zweites goal_total fürs Nachtrag-Tor", async () => {
    const db = await getTestDb();
    const seeded = await seedBase({ score: [2, 0] });
    // results_only-Zustand: 2 anonyme Auto-Charges (matchEventId NULL).
    await db.insert(charges).values([
      {
        pledgeId: seeded.pledgeId,
        pledgeRuleId: seeded.goalTotalRuleId,
        matchId: seeded.matchId,
        matchEventId: null,
        goalIndex: 1,
        triggerType: "goal_total",
        amountCents: 600,
        status: "confirmed",
        confirmedAt: new Date()
      },
      {
        pledgeId: seeded.pledgeId,
        pledgeRuleId: seeded.goalTotalRuleId,
        matchId: seeded.matchId,
        matchEventId: null,
        goalIndex: 2,
        triggerType: "goal_total",
        amountCents: 600,
        status: "confirmed",
        confirmedAt: new Date()
      }
    ]);

    const result = expectOk(await addManualEvent({
      matchId: seeded.matchId,
      minute: 12,
      type: "tor",
      side: "heim",
      playerName: "Max Müller"
    }));

    expect(result.charges).toBe(0);
    const all = await db.select().from(charges);
    expect(all).toHaveLength(2); // nur die anonymen Auto-Charges
  });

  it("B2 Gegenrichtung: ohne anonyme Auto-Charges erzeugt das manuelle Tor weiter ein goal_total (approval-pflichtig)", async () => {
    const db = await getTestDb();
    const seeded = await seedBase({ score: [2, 0] });

    const result = expectOk(await addManualEvent({
      matchId: seeded.matchId,
      minute: 12,
      type: "tor",
      side: "heim",
      playerName: "Max Müller"
    }));

    expect(result.charges).toBe(1);
    const all = await db.select().from(charges);
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("pending_approval");
  });

  it("B2: goal_by_player feuert auch bei vorhandenen anonymen Auto-Charges (Nachtrag ist genau dafür da)", async () => {
    const db = await getTestDb();
    const seeded = await seedBase({ score: [2, 0], extraPlayerRule: "Max Müller" });
    await db.insert(charges).values({
      pledgeId: seeded.pledgeId,
      pledgeRuleId: seeded.goalTotalRuleId,
      matchId: seeded.matchId,
      matchEventId: null,
      goalIndex: 1,
      triggerType: "goal_total",
      amountCents: 600,
      status: "confirmed",
      confirmedAt: new Date()
    });

    const result = expectOk(await addManualEvent({
      matchId: seeded.matchId,
      minute: 12,
      type: "tor",
      side: "heim",
      playerName: "Max Müller"
    }));

    // goal_total unterdrückt, goal_by_player feuert.
    expect(result.charges).toBe(1);
    const all = await db.select().from(charges);
    const types = all.map((c) => c.triggerType).sort();
    expect(types).toEqual(["goal_by_player", "goal_total"]);
  });

  it("Root-Fix: zwei pending Proposals desselben Events reservieren KEIN Cap-Budget — beide entstehen (Enforcement beim Confirm)", async () => {
    const db = await getTestDb();
    // goal_total (600) + goal_by_player (600), Cap 1000. Manuelle Events sind
    // immer approval-pflichtig (C1) → beide Charges pending. Seit dem Root-Fix
    // zählt pending NICHT gegen den Cap, also entstehen BEIDE; die 1000er-Grenze
    // greift erst beim Bestätigen (findConfirmCapViolation), nicht beim Anlegen.
    const seeded = await seedBase({
      score: [2, 0],
      monthlyCapCents: 1000,
      extraPlayerRule: "Max Müller"
    });

    const result = expectOk(await addManualEvent({
      matchId: seeded.matchId,
      minute: 12,
      type: "tor",
      side: "heim",
      playerName: "Max Müller"
    }));

    expect(result.charges).toBe(2);
    const all = await db.select().from(charges);
    expect(all).toHaveLength(2);
    expect(all.every((c) => c.status === "pending_approval")).toBe(true);
  });

  it("Root-Fix: bereits confirmed Charges füllen den Cap → manuelles pending wird beim Anlegen geblockt", async () => {
    const db = await getTestDb();
    // Cap 1000, bereits 1000 confirmed (anderes Spiel, aktueller Monat) → für
    // eine neue (pending) Manual-Charge ist kein confirmed+invoiced-Rest da.
    const seeded = await seedBase({ score: [2, 0], monthlyCapCents: 1000 });
    await db.insert(charges).values({
      pledgeId: seeded.pledgeId,
      pledgeRuleId: seeded.goalTotalRuleId,
      matchId: null,
      matchEventId: null,
      saison: "2025/26",
      triggerType: "goal_total",
      amountCents: 1000,
      status: "confirmed",
      confirmedAt: new Date()
    });

    const result = expectOk(await addManualEvent({
      matchId: seeded.matchId,
      minute: 12,
      type: "tor",
      side: "heim",
      playerName: "Max Müller"
    }));

    expect(result.charges).toBe(0);
    const all = await db.select().from(charges);
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe("confirmed");
  });

  it("B7: manuelles Tor auf scheduled-Match erzeugt Event, aber keine Sofort-Charges", async () => {
    const db = await getTestDb();
    const seeded = await seedBase({ matchStatus: "scheduled" });

    const result = expectOk(await addManualEvent({
      matchId: seeded.matchId,
      minute: 12,
      type: "tor",
      side: "heim",
      playerName: "Max Müller"
    }));

    expect(result.charges).toBe(0);
    expect(await db.select().from(charges)).toHaveLength(0);
    // Event selbst ist gespeichert — evaluate-match rechnet beim finished-Übergang ab.
    const events = await db
      .select()
      .from(matchEvents)
      .where(eq(matchEvents.matchId, seeded.matchId));
    expect(events).toHaveLength(1);
  });
});
