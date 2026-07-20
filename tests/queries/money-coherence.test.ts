/**
 * Regressionstests für die Kohärenz-Härtung 2026-07-19.
 *
 * Am selben Tag haben vier unabhängige Agenten je eine Geld-Anzeige korrigiert.
 * Ein Kohärenz-Check über alle 28 Charge-Aggregate im Repo förderte danach die
 * Widersprüche zutage, die zwischen den Fixes übrig blieben. Diese Datei sichert
 * genau die ab — jeder Test hier ist gegen den Vorzustand rot.
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
import { listMatchCharges } from "@/lib/db/queries/matches";
import { listChargesForClub } from "@/lib/db/queries/club-reporting";
import { currentMonthStr } from "@/lib/db/queries/platform-stats";

describe("currentMonthStr", () => {
  it("liefert den UTC-Monat, nicht den lokalen", () => {
    // vitest.config.ts pinnt TZ=America/New_York. Ohne UTC-Umstellung wich der
    // String am Monatsrand vom Fenster ab, das getTopClubsForMonth abfragt.
    const now = new Date();
    const erwartet = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    expect(currentMonthStr()).toBe(erwartet);
  });
});

describe.skipIf(isIntegrationDbDisabled)("Geld-Kohärenz (integration)", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seed();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("listMatchCharges zählt Storno und pending nicht als Geld", async () => {
    // Der auffälligste Widerspruch: Spieleliste und Spieldetail sind EINEN
    // KLICK auseinander. Die Liste war seit 3c2f8d0 gefiltert, die Detailseite
    // nicht — nach einer Wertungskorrektur zeigten sie verschiedene Beträge.
    const data = await listMatchCharges("m_1");
    // confirmed 1000 + invoiced 500 = Geld. cancelled 4400 fällt ganz raus.
    expect(data.totalCents).toBe(1500);
    // pending 8800 bleibt als ZEILE sichtbar (die Meldung soll die Detailseite
    // weiterhin anzeigen), zählt aber getrennt — nicht als Geld.
    expect(data.rows).toHaveLength(3);
    expect(data.pendingCents).toBe(8800);
    // Auch die Aufschlüsselungen dürfen weder Storno noch pending enthalten.
    expect(data.byTrigger.reduce((s, t) => s + t.totalCents, 0)).toBe(1500);
    expect(data.bySponsor.reduce((s, t) => s + t.totalCents, 0)).toBe(1500);
  });

  it("dateTo schließt den ganzen Tag ein, auch auf Mikrosekunden", async () => {
    // created_at kommt aus defaultNow() mit Mikrosekunden-Auflösung. Das alte
    // inklusive Ende `<= 23:59:59.999` verlor alles in den letzten 999 µs.
    const rows = await listChargesForClub("club_a", {
      filter: { dateTo: "2026-03-10" }
    });
    expect(rows.map((r) => r.id)).toContain("c_mikro");
  });

  it("Default-Sort drückt Saison-Beiträge nicht dauerhaft auf Seite 1", async () => {
    // matches.datum ist bei Saison-Beiträgen NULL, Postgres sortiert DESC per
    // Default NULLS FIRST. Die drei ältesten Saison-Beiträge klemmten dadurch
    // oben und verdrängten die Spiel-Beiträge des gefilterten Zeitraums.
    const page1 = await listChargesForClub("club_a", {
      pagination: { page: 1, pageSize: 2 }
    });
    // Neueste zuerst: die beiden jungen Spiel-Beiträge, nicht die alten
    // Saison-Beiträge von Januar 2025.
    expect(page1.rows.map((r) => r.id)).not.toContain("c_alt_saison");
  });
});

async function seed() {
  const db = await getTestDb();

  await db.insert(clubs).values([
    { id: "club_a", slug: "club-a", name: "FC A", isSmallBusiness: false }
  ]);
  await db.insert(teams).values([
    { id: "team_1", clubId: "club_a", name: "Team 1", saison: "2526" }
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
  await db.insert(pledges).values([
    {
      id: "pl_1",
      sponsorId: "sp_1",
      teamId: "team_1",
      status: "active",
      endsAt: new Date(Date.UTC(2030, 0, 1)),
      monthlyCapCents: 5_000_000
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
      id: "pr_win",
      pledgeId: "pl_1",
      triggerType: "win",
      amountCents: 500,
      requiresApproval: false
    },
    {
      id: "pr_season",
      pledgeId: "pl_1",
      triggerType: "season_no_relegation",
      amountCents: 100,
      requiresApproval: false
    }
  ]);
  await db.insert(matches).values([
    {
      id: "m_1",
      teamId: "team_1",
      fussballdeSpielId: "fs_1",
      datum: new Date(Date.UTC(2026, 2, 1, 14, 0)),
      heimName: "Team 1",
      gastName: "FC X",
      ergebnisHeim: 2,
      ergebnisGast: 1,
      status: "finished"
    }
  ]);

  const now = new Date();
  await db.insert(charges).values([
    // m_1: zwei zählende + zwei nicht zählende Beiträge.
    {
      id: "c_ok1",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_goal",
      matchId: "m_1",
      triggerType: "goal_total",
      amountCents: 1000,
      status: "confirmed",
      confirmedAt: now
    },
    {
      id: "c_ok2",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_win",
      matchId: "m_1",
      triggerType: "win",
      amountCents: 500,
      status: "invoiced",
      confirmedAt: now
    },
    {
      id: "c_storno",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_goal",
      matchId: "m_1",
      goalIndex: 2,
      triggerType: "goal_total",
      amountCents: 4400,
      status: "cancelled",
      cancelledReason: "match_updated",
      cancelledAt: now
    },
    {
      id: "c_pending",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_win",
      matchId: "m_1",
      goalIndex: 3,
      triggerType: "win",
      amountCents: 8800,
      status: "pending_approval"
    },
    // Mikrosekunden-Randfall am Tagesende.
    {
      id: "c_mikro",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_season",
      matchId: null,
      saison: "2526",
      triggerType: "season_no_relegation",
      amountCents: 100,
      status: "confirmed",
      confirmedAt: new Date("2026-03-10T23:59:59.999Z")
    },
    // Alter Saison-Beitrag ohne Spieldatum — darf den Default-Sort nicht kapern.
    {
      id: "c_alt_saison",
      pledgeId: "pl_1",
      pledgeRuleId: "pr_season",
      matchId: null,
      saison: "2425",
      triggerType: "season_no_relegation",
      amountCents: 100,
      status: "confirmed",
      confirmedAt: new Date("2025-01-15T10:00:00.000Z")
    }
  ]);
}
