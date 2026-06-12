/**
 * Integration-Tests für das Saison-Wrapped-Aggregat (W4, Plan 2026-06-12):
 * getWrappedStats + getWrappedEntryInfo gegen die Docker-Test-DB.
 *
 * Saison-Konstellation: Team lebt in "2627", das Wrapped aggregiert die
 * VORSAISON "2526" → Fenster [2025-07-01, 2026-07-01).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import {
  clubs,
  teams,
  users,
  sponsors,
  pledges,
  pledgeRules,
  matches,
  matchEvents,
  charges
} from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import {
  getWrappedStats,
  getWrappedEntryInfo,
  getWrappedStatsForPrevSeason
} from "@/lib/db/queries/wrapped";

const CLUB_NAME = "Sportfreunde Testkirchen";

async function seedTeam(saison = "2627") {
  const [club] = await db
    .insert(clubs)
    .values({
      slug: `c-${createId().slice(0, 8)}`,
      name: CLUB_NAME,
      fussballdeVereinId: createId()
    })
    .returning({ id: clubs.id });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: club.id,
      name: "1. Herren",
      saison,
      fussballdeTeamId: createId(),
      isActive: true
    })
    .returning({ id: teams.id });
  return team.id;
}

type MatchSeed = {
  datum: string;
  heim?: string;
  gast?: string;
  eh?: number | null;
  eg?: number | null;
  hzH?: number | null;
  hzG?: number | null;
  status?: "finished" | "scheduled";
};

async function seedMatch(teamId: string, m: MatchSeed): Promise<string> {
  const [row] = await db
    .insert(matches)
    .values({
      teamId,
      fussballdeSpielId: createId(),
      datum: new Date(`${m.datum}T14:00:00Z`),
      heimName: m.heim ?? CLUB_NAME,
      gastName: m.gast ?? "Gegner",
      ergebnisHeim: m.eh ?? null,
      ergebnisGast: m.eg ?? null,
      halbzeitHeim: m.hzH ?? null,
      halbzeitGast: m.hzG ?? null,
      status: m.status ?? "finished"
    })
    .returning({ id: matches.id });
  return row.id;
}

async function seedGoal(
  matchId: string,
  side: "heim" | "gast",
  minute: number,
  playerName: string | null = null
) {
  await db.insert(matchEvents).values({
    matchId,
    type: "tor",
    side,
    minute,
    playerName,
    source: "scraped"
  });
}

async function seedPact(teamId: string) {
  const uid = `u_${createId().slice(0, 8)}`;
  await db.insert(users).values({ id: uid, email: `${uid}@example.com` });
  const [sponsor] = await db
    .insert(sponsors)
    .values({ userId: uid, displayName: "Wrapped-Sponsor", type: "familie" })
    .returning({ id: sponsors.id });
  const [pledge] = await db
    .insert(pledges)
    .values({
      sponsorId: sponsor.id,
      teamId,
      status: "active",
      startsAt: new Date("2025-07-01T00:00:00Z"),
      endsAt: new Date("2026-06-30T00:00:00Z")
    })
    .returning({ id: pledges.id });
  const [rule] = await db
    .insert(pledgeRules)
    .values({
      pledgeId: pledge.id,
      triggerType: "goal_total",
      amountCents: 100,
      requiresApproval: false
    })
    .returning({ id: pledgeRules.id });
  return { pledgeId: pledge.id, ruleId: rule.id };
}

describe("getWrappedStats", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("aggregiert alle Wrapped-Felder über das Vorsaison-Fenster", async () => {
    const teamId = await seedTeam("2627");

    // 1) Heimsieg 3:1 — Torschützen Max Müller ×2, Tom Test ×1, nie hinten.
    const m1 = await seedMatch(teamId, { datum: "2025-08-15", gast: "Gegner A", eh: 3, eg: 1 });
    await seedGoal(m1, "heim", 10, "Max Müller");
    await seedGoal(m1, "heim", 40, "Max Müller");
    await seedGoal(m1, "heim", 70, "Tom Test");
    await seedGoal(m1, "gast", 80);

    // 2) Auswärtssieg 0:2 ohne Events (results_only) — zu Null.
    const m2 = await seedMatch(teamId, { datum: "2025-09-10", heim: "Gegner B", gast: CLUB_NAME, eh: 0, eg: 2 });

    // 3) Comeback-Heimsieg 2:1 — 0:1 hinten (Min. 5), gedreht.
    const m3 = await seedMatch(teamId, { datum: "2025-10-05", gast: "Gegner C", eh: 2, eg: 1 });
    await seedGoal(m3, "gast", 5);
    await seedGoal(m3, "heim", 50, "Max Müller");
    await seedGoal(m3, "heim", 60);

    // 4) Auswärtsniederlage 4:1.
    await seedMatch(teamId, { datum: "2025-11-02", heim: "Gegner D", gast: CLUB_NAME, eh: 4, eg: 1 });

    // 5) Heim-Unentschieden 2:2.
    await seedMatch(teamId, { datum: "2026-03-08", gast: "Gegner E", eh: 2, eg: 2 });

    // 6) Höchster Sieg 6:0 (heim) — zweiter Zu-Null-Sieg.
    await seedMatch(teamId, { datum: "2026-04-12", gast: "Gegner F", eh: 6, eg: 0 });

    // Außerhalb des Fensters / ohne Wertung: Vor-Vorsaison, aktuelle Saison, geplant.
    await seedMatch(teamId, { datum: "2025-06-20", eh: 5, eg: 0 }); // Vor-Vorsaison
    const mCurrent = await seedMatch(teamId, { datum: "2026-09-01", eh: 3, eg: 0 }); // 26/27
    await seedMatch(teamId, { datum: "2026-05-01", status: "scheduled" });

    // Pact + Charges: confirmed/invoiced zählen, Saison-Charge zählt,
    // pending/cancelled/außerhalb des Fensters zählen NICHT.
    const { pledgeId, ruleId } = await seedPact(teamId);
    await db.insert(charges).values([
      { pledgeId, pledgeRuleId: ruleId, matchId: m1, goalIndex: 1, triggerType: "goal_total", amountCents: 300, status: "confirmed" },
      { pledgeId, pledgeRuleId: ruleId, matchId: m2, goalIndex: 1, triggerType: "goal_total", amountCents: 200, status: "invoiced" },
      { pledgeId, pledgeRuleId: ruleId, matchId: m1, goalIndex: 2, triggerType: "goal_total", amountCents: 500, status: "pending_approval" },
      { pledgeId, pledgeRuleId: ruleId, matchId: m3, goalIndex: 1, triggerType: "goal_total", amountCents: 999, status: "cancelled" },
      { pledgeId, pledgeRuleId: ruleId, matchId: null, saison: "2526", triggerType: "season_custom", amountCents: 400, status: "confirmed" },
      { pledgeId, pledgeRuleId: ruleId, matchId: mCurrent, goalIndex: 1, triggerType: "goal_total", amountCents: 700, status: "confirmed" }
    ]);

    const stats = await getWrappedStats(teamId, "2526");
    expect(stats).not.toBeNull();
    expect(stats).toMatchObject({
      teamName: "1. Herren",
      saison: "2526",
      spiele: 6,
      siege: 4,
      unentschieden: 1,
      niederlagen: 1,
      toreGeschossen: 16,
      toreKassiert: 8,
      besterTorschuetze: { name: "Max Müller", tore: 3 },
      zuNull: 2,
      comebacks: 1,
      heimsiege: 3,
      auswaertssiege: 1,
      hoechsterSieg: { heimName: CLUB_NAME, gastName: "Gegner F", ergebnis: "6:0" },
      pactsCount: 1,
      beitraegeSummeCents: 300 + 200 + 400,
      simulationFallbackCents: null
    });
  });

  it("liefert den Simulation-Fallback (Tore × 100) bei 0 Pacts", async () => {
    const teamId = await seedTeam("2627");
    // 0:0, Auswärts 2:1 (Niederlage, 1 eigenes Tor), Heim 1:1.
    await seedMatch(teamId, { datum: "2025-09-01", gast: "X", eh: 0, eg: 0 });
    await seedMatch(teamId, { datum: "2025-10-01", heim: "Gegner Y", gast: CLUB_NAME, eh: 2, eg: 1 });
    await seedMatch(teamId, { datum: "2025-11-01", gast: "Z", eh: 1, eg: 1 });

    const stats = await getWrappedStats(teamId, "2526");
    expect(stats).toMatchObject({
      spiele: 3,
      siege: 0,
      toreGeschossen: 2,
      besterTorschuetze: null,
      hoechsterSieg: null,
      zuNull: 0,
      comebacks: 0,
      heimsiege: 0,
      auswaertssiege: 0,
      pactsCount: 0,
      beitraegeSummeCents: 0,
      simulationFallbackCents: 200
    });
  });

  it("null für unbekannte Teams und ungültige Saison-Codes", async () => {
    await expect(getWrappedStats("gibt-es-nicht", "2526")).resolves.toBeNull();
    const teamId = await seedTeam("2627");
    await expect(getWrappedStats(teamId, "25/26x")).resolves.toBeNull();
  });

  it("getWrappedStatsForPrevSeason nutzt die Vorsaison aus team.saison", async () => {
    const teamId = await seedTeam("2627");
    await seedMatch(teamId, { datum: "2025-09-01", eh: 2, eg: 0 }); // 25/26
    await seedMatch(teamId, { datum: "2026-09-01", eh: 9, eg: 0 }); // 26/27 — nicht im Wrapped
    const stats = await getWrappedStatsForPrevSeason(teamId);
    expect(stats?.saison).toBe("2526");
    expect(stats?.spiele).toBe(1);
    expect(stats?.toreGeschossen).toBe(2);
  });
});

describe("getWrappedEntryInfo", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("zeigt die Karte bei >=3 Vorsaison-Spielen und <5 aktuellen Spielen", async () => {
    const teamId = await seedTeam("2627");
    for (let i = 1; i <= 3; i++) {
      await seedMatch(teamId, { datum: `2025-09-0${i}`, eh: 1, eg: 0 });
    }
    await seedMatch(teamId, { datum: "2026-08-10", eh: 1, eg: 0 }); // 1 aktuelles Spiel
    await expect(getWrappedEntryInfo(teamId)).resolves.toEqual({ prevSaison: "2526" });
  });

  it("null bei <3 Vorsaison-Spielen", async () => {
    const teamId = await seedTeam("2627");
    await seedMatch(teamId, { datum: "2025-09-01", eh: 1, eg: 0 });
    await seedMatch(teamId, { datum: "2025-09-08", eh: 1, eg: 0 });
    await expect(getWrappedEntryInfo(teamId)).resolves.toBeNull();
  });

  it("null sobald die aktuelle Saison >=5 gespielte Spiele hat", async () => {
    const teamId = await seedTeam("2627");
    for (let i = 1; i <= 3; i++) {
      await seedMatch(teamId, { datum: `2025-09-0${i}`, eh: 1, eg: 0 });
    }
    for (let i = 1; i <= 5; i++) {
      await seedMatch(teamId, { datum: `2026-09-0${i}`, eh: 1, eg: 0 });
    }
    await expect(getWrappedEntryInfo(teamId)).resolves.toBeNull();
  });
});
