/**
 * W3 (Saison-Features 2026-06-12) — DB-Wrapper der Geld-Simulation.
 *
 * `simulateForTeamSeason` lädt finished-Matches + Events des Saison-Fensters
 * [1.7. Startjahr, 1.7. Folgejahr), bestimmt teamSide via detectTeamSide
 * (Team- + Vereinsname, wie evaluate-match) und ruft den puren Kern.
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
  charges
} from "@/lib/db/schema";
import { matches, matchEvents } from "@/lib/db/schema/matches";
import { resetTestDb } from "../setup/db";
import { getTeamPrognose, simulateForTeamSeason } from "@/lib/db/queries/simulation";

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

async function seedMatch(
  teamId: string,
  m: {
    datum: string;
    heim: string;
    gast: string;
    eh?: number | null;
    eg?: number | null;
    status?: "finished" | "scheduled";
    /** Tor-Events: Seite + Minute. */
    tore?: { side: "heim" | "gast"; minute: number }[];
  }
) {
  const [row] = await db
    .insert(matches)
    .values({
      teamId,
      fussballdeSpielId: createId(),
      datum: new Date(`${m.datum}T15:00:00`),
      heimName: m.heim,
      gastName: m.gast,
      ergebnisHeim: m.eh ?? null,
      ergebnisGast: m.eg ?? null,
      status: m.status ?? "finished"
    })
    .returning({ id: matches.id });
  for (const t of m.tore ?? []) {
    await db.insert(matchEvents).values({
      matchId: row.id,
      type: "tor",
      side: t.side,
      minute: t.minute,
      source: "scraped"
    });
  }
  return row.id;
}

describe("simulateForTeamSeason (integration)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("simuliert die Vorsaison einer 26/27-Mannschaft über Heim-/Auswärts-Spiele", async () => {
    const teamId = await seedTeam("2627");

    // Heimsieg 3:1 mit vollem Spielbericht (3 eigene Tor-Events).
    await seedMatch(teamId, {
      datum: "2025-09-14",
      heim: CLUB_NAME,
      gast: "SV Gegner",
      eh: 3,
      eg: 1,
      tore: [
        { side: "heim", minute: 12 },
        { side: "heim", minute: 44 },
        { side: "gast", minute: 60 },
        { side: "heim", minute: 78 }
      ]
    });
    // Auswärtssieg 0:2 ohne Events (results_only → 2 Endstand-Tore).
    await seedMatch(teamId, {
      datum: "2025-10-05",
      heim: "SV Gegner",
      gast: CLUB_NAME,
      eh: 0,
      eg: 2
    });
    // Geplantes Spiel + Spiel außerhalb des Fensters → ignoriert.
    await seedMatch(teamId, {
      datum: "2026-05-01",
      heim: CLUB_NAME,
      gast: "SV Gegner",
      status: "scheduled"
    });
    await seedMatch(teamId, {
      datum: "2026-08-01",
      heim: CLUB_NAME,
      gast: "SV Gegner",
      eh: 9,
      eg: 0
    });

    const result = await simulateForTeamSeason(teamId, "2526", [
      { id: "r1", triggerType: "goal_total", amountCents: 100 },
      { id: "r2", triggerType: "win", amountCents: 500 },
      { id: "r3", triggerType: "home_win", amountCents: 200 },
      { id: "r4", triggerType: "away_win", amountCents: 300 },
      { id: "r5", triggerType: "season_promotion", amountCents: 99900 }
    ]);

    expect(result).not.toBeNull();
    const byType = Object.fromEntries(result!.perRule.map((p) => [p.triggerType, p]));
    expect(byType.goal_total).toMatchObject({ count: 5, cents: 500 }); // 3 Events + 2 Endstand
    expect(byType.win).toMatchObject({ count: 2, cents: 1000 });
    expect(byType.home_win).toMatchObject({ count: 1, cents: 200 });
    expect(byType.away_win).toMatchObject({ count: 1, cents: 300 });
    expect(result!.totalCents).toBe(2000);
    expect(result!.matchCount).toBe(2);
    expect(result!.monthsCovered).toBe(2);
    expect(result!.excludedSeasonRules).toEqual(["season_promotion"]);
  });

  it("liefert ein Null-Ergebnis ohne Vorsaison-Spiele", async () => {
    const teamId = await seedTeam("2627");
    const result = await simulateForTeamSeason(teamId, "2526", [
      { id: "r1", triggerType: "win", amountCents: 500 }
    ]);
    expect(result).toMatchObject({ totalCents: 0, matchCount: 0 });
  });

  it("liefert null für unbekanntes Team oder kaputten Saison-Code", async () => {
    await expect(
      simulateForTeamSeason("gibt-es-nicht", "2526", [])
    ).resolves.toBeNull();
    const teamId = await seedTeam("2627");
    await expect(simulateForTeamSeason(teamId, "kaputt", [])).resolves.toBeNull();
  });
});

// ─── getTeamPrognose ──────────────────────────────────────────────────────────

async function seedActivePledgeWithRule(teamId: string, amountCents = 100) {
  await db
    .insert(users)
    .values({ id: "u_prog", email: "prog@example.com" })
    .onConflictDoNothing();
  const [sponsor] = await db
    .insert(sponsors)
    .values({ userId: "u_prog", displayName: "Prognose-Sponsor", type: "familie" })
    .returning({ id: sponsors.id });
  const [pledge] = await db
    .insert(pledges)
    .values({
      sponsorId: sponsor.id,
      teamId,
      status: "active",
      endsAt: new Date("2027-06-30T22:00:00")
    })
    .returning({ id: pledges.id });
  const [rule] = await db
    .insert(pledgeRules)
    .values({
      pledgeId: pledge.id,
      triggerType: "goal_total",
      amountCents,
      active: true
    })
    .returning({ id: pledgeRules.id });
  return { pledgeId: pledge.id, ruleId: rule.id };
}

describe("getTeamPrognose (integration)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("(a) simuliert aktive Pacts über die Vorsaison", async () => {
    const teamId = await seedTeam("2627");
    await seedActivePledgeWithRule(teamId, 100);
    // Vorsaison-Heimsieg 2:0 (results_only) → 2 × 1 € = 2 €.
    await seedMatch(teamId, {
      datum: "2025-09-14",
      heim: CLUB_NAME,
      gast: "SV Gegner",
      eh: 2,
      eg: 0
    });

    const prognose = await getTeamPrognose(teamId);
    expect(prognose).not.toBeNull();
    expect(prognose!.prevSaisonLabel).toBe("25/26");
    expect(prognose!.lastSeason).toMatchObject({ totalCents: 200, matchCount: 1 });
    expect(prognose!.onPace).toBeNull(); // 0 gespielte Spiele in 26/27
  });

  it("(b) rechnet ab 3 gespielten Spielen hoch (Fallback 26 erwartete Spiele)", async () => {
    const teamId = await seedTeam("2627");
    const { pledgeId, ruleId } = await seedActivePledgeWithRule(teamId, 100);

    // 3 gespielte Spiele der NEUEN Saison mit je einer bestätigten Charge à 1 €,
    // plus eine stornierte und eine offene Charge (zählen nicht).
    for (const [i, datum] of ["2026-08-09", "2026-08-23", "2026-09-06"].entries()) {
      const matchId = await seedMatch(teamId, {
        datum,
        heim: CLUB_NAME,
        gast: "SV Gegner",
        eh: 1,
        eg: 0
      });
      await db.insert(charges).values({
        pledgeId,
        pledgeRuleId: ruleId,
        matchId,
        triggerType: "goal_total",
        amountCents: 100,
        status: i === 0 ? "invoiced" : "confirmed",
        goalIndex: 1
      });
      if (i === 0) {
        await db.insert(charges).values([
          {
            pledgeId,
            pledgeRuleId: ruleId,
            matchId,
            triggerType: "goal_total",
            amountCents: 7700,
            status: "cancelled",
            goalIndex: 2
          },
          {
            pledgeId,
            pledgeRuleId: ruleId,
            matchId,
            triggerType: "goal_total",
            amountCents: 8800,
            status: "pending_approval",
            goalIndex: 3
          }
        ]);
      }
    }

    const prognose = await getTeamPrognose(teamId);
    expect(prognose).not.toBeNull();
    // Keine Vorsaison-Spiele → kein Rückblick, aber Hochrechnung:
    expect(prognose!.lastSeason).toBeNull();
    // 3 € über 3 Spiele × 26 erwartete Spiele = 26 €.
    expect(prognose!.onPace).toMatchObject({
      currentCents: 300,
      playedCount: 3,
      expectedGames: 26,
      projectedCents: 2600
    });
  });

  it("liefert null ohne jegliche Daten (keine Pacts, keine Spiele)", async () => {
    const teamId = await seedTeam("2627");
    await expect(getTeamPrognose(teamId)).resolves.toBeNull();
  });
});
