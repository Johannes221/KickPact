/**
 * Integration tests für `getTeamSeasonChargeTotalCents` (team-dashboard.ts) —
 * die Zahl hinter der „Sponsor-€"-Kachel auf dem Mannschafts-Dashboard.
 *
 * Befund 2026-07-17: die Kachel lief über `getMatchChargesSummaryForTeam`, das
 * hart auf `match_id IS NOT NULL` filtert. Saison-Charges (evaluate-season,
 * z.B. Klassenerhalt) haben per Konstruktion `match_id = NULL` und fielen
 * komplett raus. Dieselbe Query hatte gar keinen Status-Filter, zählte also
 * `cancelled` und `pending_approval` als Geld mit.
 *
 * Gated wie club-reporting.test.ts via `isIntegrationDbDisabled`.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  clubs,
  teams,
  users,
  sponsors,
  pledges,
  pledgeRules,
  matches,
  charges
} from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
  getTeamSeasonChargeTotalCents,
  getSeasonGoalChargeTotalCents
} from "@/lib/db/queries/team-dashboard";
import { getMatchChargesSummaryForTeam } from "@/lib/db/queries/matches";

describe.skipIf(isIntegrationDbDisabled)("Sponsor-€ pro Saison (integration)", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seed();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("zählt Saison-Charges (match_id NULL) mit — das war der Befund", async () => {
    // Spiel-Charges 25/26: 1000 + 1000 = 2000. Saison-Charge Klassenerhalt: 5000.
    const total = await getTeamSeasonChargeTotalCents("team_1", "2526");
    expect(total).toBe(7000);
  });

  it("ignoriert cancelled und pending_approval", async () => {
    // Gegenprobe zum Test oben: ohne Status-Filter käme 7000 + 9900 (cancelled)
    // + 8800 (pending) = 25700 heraus. Die Differenz ist der Beleg.
    const db = await getTestDb();
    const roh = await db
      .select({ total: sql<number>`COALESCE(SUM(${charges.amountCents}),0)::int` })
      .from(charges)
      .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
      .where(and(eq(pledges.teamId, "team_1"), isNull(charges.matchId)));
    // Alle saison-gebundenen Rows roh: 5000 + 9900 + 8800 = 23700.
    expect(roh[0].total).toBe(23700);
    expect(await getTeamSeasonChargeTotalCents("team_1", "2526")).toBe(7000);
  });

  it("Spiel-Charge exakt auf der Fenstergrenze (01.07.) zählt zur neuen Saison", async () => {
    // Halboffenes Fenster [Saisonstart, Folgesaison): der 01.07.2025 gehört zu
    // 25/26, der 30.06.2025 noch zu 24/25. Das ist die Kante, an der ein
    // Off-by-one Geld zwischen zwei Saisons verschieben würde.
    expect(await getTeamSeasonChargeTotalCents("team_grenze", "2526")).toBe(100);
    expect(await getTeamSeasonChargeTotalCents("team_grenze", "2425")).toBe(200);
  });

  it("Saisonziel-Summe findet die Vorsaison-Charge im Grace-Fenster", async () => {
    // Der Kern des Grace-Window-Problems: team_rollover steht schon auf 26/27,
    // der Klassenerhalt-Beitrag trägt aber "2526". Der Saison-Endstand-Block
    // fragt mit seiner EIGENEN Saison (resolveSeasonResultTarget → Vorsaison)
    // und findet ihn deshalb — korrekt als 25/26 beschriftet.
    expect(await getSeasonGoalChargeTotalCents("team_rollover", "2526")).toBe(4200);
    expect(await getSeasonGoalChargeTotalCents("team_rollover", "2627")).toBe(0);
  });

  it("Saisonziel-Summe enthält KEINE Spiel-Beiträge und kein Storno", async () => {
    // team_1 hat 2000 Spiel-Beiträge + 5000 Saisonziel + 9900 storniert.
    expect(await getSeasonGoalChargeTotalCents("team_1", "2526")).toBe(5000);
  });

  it("Saisonziel-Summe matcht das Langformat \"2025/26\"", async () => {
    expect(await getSeasonGoalChargeTotalCents("team_2", "2526")).toBe(300);
  });

  it("Saison-Charge einer FRÜHEREN Saison zählt nicht zur laufenden", async () => {
    // Konstellation aus dem Saison-Rollover: teams.saison wird am 15.7.
    // gebumpt, der Verein trägt den Endstand der VORsaison aber erst im
    // Grace-Fenster (bis 1.10.) ein → charges.saison = Vorsaison. Diese Charge
    // darf die Kachel der laufenden Saison nicht aufblähen.
    expect(await getTeamSeasonChargeTotalCents("team_rollover", "2627")).toBe(0);
    expect(await getTeamSeasonChargeTotalCents("team_rollover", "2526")).toBe(4200);
  });

  it("grenzt auf die gefragte Saison ab (Vorsaison zählt nicht)", async () => {
    // 24/25 hat nur die Spiel-Charge c_prev (700) — kein Saison-Ziel.
    expect(await getTeamSeasonChargeTotalCents("team_1", "2425")).toBe(700);
  });

  it("matcht beide gespeicherten Saison-Formate (\"2526\" und \"2025/26\")", async () => {
    // c_season_longfmt (300) liegt als "2025/26" in der Spalte.
    const total = await getTeamSeasonChargeTotalCents("team_2", "2526");
    expect(total).toBe(300);
  });

  it("liefert 0 statt null für eine Mannschaft ohne Beiträge", async () => {
    expect(await getTeamSeasonChargeTotalCents("team_3", "2526")).toBe(0);
  });

  it("getMatchChargesSummaryForTeam: cancelled/pending fließen nicht in die Pro-Spiel-Summe", async () => {
    // Die Spieleliste zeigt diese Map pro Zeile — ein Storno nach fussball.de-
    // Korrektur darf die angezeigte Summe des Spiels nicht aufblähen.
    const map = await getMatchChargesSummaryForTeam("team_1");
    // m_1 trägt c_1 (1000, confirmed) + c_m1_cancelled (4400, cancelled).
    expect(map.get("m_1")).toBe(1000);
  });
});

async function seed() {
  const db = await getTestDb();

  await db.insert(clubs).values([
    { id: "club_a", slug: "club-a", name: "FC A", isSmallBusiness: false }
  ]);

  await db.insert(teams).values([
    { id: "team_1", clubId: "club_a", name: "Team 1", saison: "2526" },
    { id: "team_2", clubId: "club_a", name: "Team 2", saison: "2526" },
    { id: "team_3", clubId: "club_a", name: "Team 3", saison: "2526" },
    { id: "team_grenze", clubId: "club_a", name: "Grenze", saison: "2526" },
    { id: "team_rollover", clubId: "club_a", name: "Rollover", saison: "2627" }
  ]);

  await db.insert(users).values([
    {
      id: "u_sp1",
      name: "Sponsor One",
      email: "sp1@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ]);

  await db.insert(sponsors).values([
    { id: "sp_1", userId: "u_sp1", displayName: "Sponsor 1", type: "familie" }
  ]);

  const endsAt = new Date(Date.UTC(2030, 0, 1));
  await db.insert(pledges).values([
    {
      id: "pl_1",
      sponsorId: "sp_1",
      teamId: "team_1",
      status: "active",
      endsAt,
      monthlyCapCents: 500000
    },
    {
      id: "pl_2",
      sponsorId: "sp_1",
      teamId: "team_2",
      status: "active",
      endsAt,
      monthlyCapCents: 500000
    },
    {
      id: "pl_grenze",
      sponsorId: "sp_1",
      teamId: "team_grenze",
      status: "active",
      endsAt,
      monthlyCapCents: 500000
    },
    {
      id: "pl_rollover",
      sponsorId: "sp_1",
      teamId: "team_rollover",
      status: "active",
      endsAt,
      monthlyCapCents: 500000
    }
  ]);

  await db.insert(pledgeRules).values([
    {
      id: "pr_goal",
      pledgeId: "pl_1",
      triggerType: "goal_total",
      amountCents: 1000,
      requiresApproval: false
    },
    {
      id: "pr_season",
      pledgeId: "pl_1",
      triggerType: "season_no_relegation",
      amountCents: 5000,
      requiresApproval: false
    },
    {
      id: "pr_season_2",
      pledgeId: "pl_2",
      triggerType: "season_no_relegation",
      amountCents: 300,
      requiresApproval: false
    },
    {
      id: "pr_grenze",
      pledgeId: "pl_grenze",
      triggerType: "goal_total",
      amountCents: 100,
      requiresApproval: false
    },
    {
      id: "pr_rollover",
      pledgeId: "pl_rollover",
      triggerType: "season_no_relegation",
      amountCents: 4200,
      requiresApproval: false
    }
  ]);

  // Saison 25/26 läuft ab 01.07.2025, Saison 24/25 ab 01.07.2024.
  await db.insert(matches).values([
    {
      id: "m_1",
      teamId: "team_1",
      fussballdeSpielId: "fs_1",
      datum: new Date(Date.UTC(2025, 8, 1, 14, 0)),
      heimName: "Team 1",
      gastName: "FC X",
      ergebnisHeim: 2,
      ergebnisGast: 1,
      status: "finished"
    },
    {
      id: "m_2",
      teamId: "team_1",
      fussballdeSpielId: "fs_2",
      datum: new Date(Date.UTC(2025, 8, 15, 14, 0)),
      heimName: "Team 1",
      gastName: "FC Z",
      ergebnisHeim: 1,
      ergebnisGast: 0,
      status: "finished"
    },
    {
      id: "m_prev",
      teamId: "team_1",
      fussballdeSpielId: "fs_prev",
      datum: new Date(Date.UTC(2024, 9, 5, 14, 0)),
      heimName: "Team 1",
      gastName: "FC Alt",
      ergebnisHeim: 1,
      ergebnisGast: 1,
      status: "finished"
    },
    // Fenstergrenze: saisonStartDate() baut `new Date(jahr, 6, 1)` in LOKALER
    // Zeit — die Fixtures hier deshalb ebenso, sonst testet der Grenzfall die
    // Zeitzonen-Verschiebung statt das halboffene Fenster.
    {
      id: "m_grenze_neu",
      teamId: "team_grenze",
      fussballdeSpielId: "fs_grenze_neu",
      datum: new Date(2025, 6, 1, 0, 0),
      heimName: "Grenze",
      gastName: "FC Kante",
      ergebnisHeim: 1,
      ergebnisGast: 0,
      status: "finished"
    },
    {
      id: "m_grenze_alt",
      teamId: "team_grenze",
      fussballdeSpielId: "fs_grenze_alt",
      datum: new Date(2025, 5, 30, 12, 0),
      heimName: "Grenze",
      gastName: "FC Vortag",
      ergebnisHeim: 0,
      ergebnisGast: 1,
      status: "finished"
    }
  ]);

  const now = new Date();
  await db.insert(charges).values([
    // ── Saison 25/26, Spiel-Charges ──
    {
      id: "c_1",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_goal",
      matchId: "m_1",
      triggerType: "goal_total",
      amountCents: 1000,
      status: "confirmed",
      confirmedAt: now
    },
    {
      id: "c_2",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_goal",
      matchId: "m_2",
      triggerType: "goal_total",
      amountCents: 1000,
      status: "confirmed",
      confirmedAt: now
    },
    // ── Saison 25/26, Saison-Charge (match_id NULL) — der eigentliche Befund ──
    {
      id: "c_season",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_season",
      matchId: null,
      saison: "2526",
      triggerType: "season_no_relegation",
      amountCents: 5000,
      status: "confirmed",
      confirmedAt: now
    },
    // ── Rauschen, das nie als Geld zählen darf ──
    {
      id: "c_cancelled",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_season",
      matchId: null,
      saison: "2526",
      triggerType: "season_no_relegation",
      amountCents: 9900,
      status: "cancelled",
      cancelledReason: "match_updated",
      cancelledAt: now
    },
    {
      id: "c_pending",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_goal",
      matchId: null,
      saison: "2526",
      triggerType: "goal_total",
      amountCents: 8800,
      status: "pending_approval"
    },
    {
      id: "c_m1_cancelled",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_goal",
      matchId: "m_1",
      triggerType: "goal_total",
      amountCents: 4400,
      status: "cancelled",
      cancelledReason: "match_updated",
      cancelledAt: now
    },
    // ── Vorsaison 24/25 ──
    {
      id: "c_prev",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_goal",
      matchId: "m_prev",
      triggerType: "goal_total",
      amountCents: 700,
      status: "confirmed",
      confirmedAt: now
    },
    // ── team_2: Saison-Charge im Langformat ──
    {
      id: "c_season_longfmt",
      pledgeId: "pl_2",
      pledgeRuleId: "pr_season_2",
      matchId: null,
      saison: "2025/26",
      triggerType: "season_no_relegation",
      amountCents: 300,
      status: "confirmed",
      confirmedAt: now
    },
    // ── Fenstergrenze 01.07. ──
    {
      id: "c_grenze_neu",
      pledgeId: "pl_grenze",
      pledgeRuleId: "pr_grenze",
      matchId: "m_grenze_neu",
      triggerType: "goal_total",
      amountCents: 100,
      status: "confirmed",
      confirmedAt: now
    },
    {
      id: "c_grenze_alt",
      pledgeId: "pl_grenze",
      pledgeRuleId: "pr_grenze",
      matchId: "m_grenze_alt",
      triggerType: "goal_total",
      amountCents: 200,
      status: "confirmed",
      confirmedAt: now
    },
    // ── Rollover: Saison-Charge der VORsaison, Team steht schon auf 26/27 ──
    {
      id: "c_rollover_prev",
      pledgeId: "pl_rollover",
      pledgeRuleId: "pr_rollover",
      matchId: null,
      saison: "2526",
      triggerType: "season_no_relegation",
      amountCents: 4200,
      status: "confirmed",
      confirmedAt: now
    }
  ]);
}
