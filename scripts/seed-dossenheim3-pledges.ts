/**
 * Legt Pledges für Dossenheim 3 an.
 * Nutzt bestehende Sponsoren aus seed-real-dossenheim.ts.
 *
 * Run: cd /Users/johan/kickpact && npx dotenv -e .env.local -- npx tsx scripts/seed-dossenheim3-pledges.ts
 */
import { eq, and } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "../lib/db/client";
import { teams } from "../lib/db/schema/clubs";
import { sponsors } from "../lib/db/schema/sponsors";
import { pledges, pledgeRules } from "../lib/db/schema/pledges";
import { matches, matchEvents } from "../lib/db/schema/matches";
import { charges } from "../lib/db/schema/charges";
import { evaluateTriggers, type MatchInput } from "../lib/crawler/triggers";
import { loadActivePledgeRulesForTeam, getMonthlyChargedCents } from "../lib/db/queries/evaluation";

const DOSSENHEIM3_TEAM_ID = "ytbng7w893495ncjtog7amce";

async function upsertPledge(sponsorId: string, teamId: string, opts: {
  startsAt: Date;
  endsAt: Date;
  monthlyCapCents?: number;
}): Promise<string> {
  const [existing] = await db
    .select({ id: pledges.id })
    .from(pledges)
    .where(and(eq(pledges.sponsorId, sponsorId), eq(pledges.teamId, teamId)))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db.insert(pledges).values({
    id: createId(),
    sponsorId,
    teamId,
    status: "active",
    startsAt: opts.startsAt,
    endsAt: opts.endsAt,
    monthlyCapCents: opts.monthlyCapCents ?? null,
  }).returning({ id: pledges.id });
  return created.id;
}

async function upsertRule(
  pledgeId: string,
  triggerType: string,
  amountCents: number,
  params?: Record<string, unknown>,
  perMatchCapCents?: number
): Promise<void> {
  const [existing] = await db
    .select({ id: pledgeRules.id })
    .from(pledgeRules)
    .where(and(eq(pledgeRules.pledgeId, pledgeId), eq(pledgeRules.triggerType, triggerType as never)))
    .limit(1);
  if (existing) return;

  await db.insert(pledgeRules).values({
    id: createId(),
    pledgeId,
    triggerType: triggerType as never,
    amountCents,
    triggerParamsJson: params ?? {},
    perMatchCapCents: perMatchCapCents ?? null,
  });
}

async function main() {
  console.log("=== Seed Dossenheim 3 Pledges ===\n");

  const [team] = await db.select().from(teams).where(eq(teams.id, DOSSENHEIM3_TEAM_ID)).limit(1);
  if (!team) throw new Error("Dossenheim 3 team nicht gefunden");
  console.log(`Team: ${team.name}`);

  // Existierende Sponsoren laden
  const allSponsors = await db.select().from(sponsors);
  if (allSponsors.length < 2) throw new Error("Keine Sponsoren in DB — bitte zuerst seed-real-dossenheim.ts laufen lassen");

  const familieSchreiber = allSponsors.find(s => s.displayName === "Familie Schreiber") ?? allSponsors[0];
  const baeckerei = allSponsors.find(s => s.displayName === "Bäckerei Müller GmbH") ?? allSponsors[1];
  const tante = allSponsors.find(s => s.displayName === "Tante Erna") ?? allSponsors[2];

  const saison_start = new Date("2025-08-01T00:00:00Z");
  const saison_end = new Date("2026-06-30T23:59:59Z");

  // Pledge 1: Familie Schreiber — 5€ pro Tor, 15€ pro Sieg, 25€ pro Hattrick
  const pledge1 = await upsertPledge(familieSchreiber.id, team.id, {
    startsAt: saison_start,
    endsAt: saison_end,
    monthlyCapCents: 5000, // 50€ Cap
  });
  await upsertRule(pledge1, "goal_total", 500); // 5€ pro Tor
  await upsertRule(pledge1, "win", 1500);       // 15€ pro Sieg
  await upsertRule(pledge1, "hattrick", 2500);  // 25€ pro Hattrick
  console.log(`✓ Pledge 1 (Familie Schreiber): goal_total 5€, win 15€, hattrick 25€`);

  // Pledge 2: Bäckerei Müller — 10€ pro clean_sheet, 20€ pro comeback_win
  const pledge2 = await upsertPledge(baeckerei.id, team.id, {
    startsAt: saison_start,
    endsAt: saison_end,
  });
  await upsertRule(pledge2, "clean_sheet", 1000);    // 10€ zu-null
  await upsertRule(pledge2, "comeback_win", 2000);   // 20€ Comeback
  await upsertRule(pledge2, "goals_scored_min", 300, { min_goals: 3 }); // 3€ pro Spiel mit 3+ Toren
  console.log(`✓ Pledge 2 (Bäckerei Müller): clean_sheet 10€, comeback_win 20€, goals_scored_min(3) 3€`);

  // Pledge 3: Tante Erna — 2€ pro Tor, günstiger Einstieg
  const pledge3 = await upsertPledge(tante.id, team.id, {
    startsAt: saison_start,
    endsAt: saison_end,
    monthlyCapCents: 2000, // 20€ Cap
  });
  await upsertRule(pledge3, "goal_total", 200);  // 2€ pro Tor
  await upsertRule(pledge3, "win", 500);         // 5€ pro Sieg
  console.log(`✓ Pledge 3 (Tante Erna): goal_total 2€, win 5€ (Cap: 20€/Monat)`);

  console.log("\n=== Phase 2: Charges für alle Matches berechnen ===");

  // Alle Matches von Dossenheim 3 laden
  const allMatches = await db.select().from(matches).where(eq(matches.teamId, team.id));
  console.log(`${allMatches.length} Matches für Dossenheim 3`);

  const pledgeRuleRows = await loadActivePledgeRulesForTeam(team.id, new Date());
  console.log(`${pledgeRuleRows.length} aktive Pledge-Rules`);

  let totalCharges = 0;
  let totalCents = 0;

  for (const match of allMatches) {
    const events = await db
      .select()
      .from(matchEvents)
      .where(eq(matchEvents.matchId, match.id));

    const matchInput: MatchInput = {
      matchId: match.id,
      teamId: team.id,
      datum: match.datum,
      ergebnisHeim: match.ergebnisHeim ?? 0,
      ergebnisGast: match.ergebnisGast ?? 0,
      halbzeitHeim: match.halbzeitHeim ?? null,
      halbzeitGast: match.halbzeitGast ?? null,
      heimName: match.heimName,
      gastName: match.gastName,
      events: events.map((e) => ({
        id: e.id,
        type: e.type as "tor" | "auswechslung" | "spezial" | "karte",
        subtype: e.subtype ?? undefined,
        minute: e.minute ?? undefined,
        side: e.side as "heim" | "gast",
        playerName: e.playerName ?? undefined,
        playerId: e.playerId ?? undefined,
        source: e.source as "scraped" | "manual",
      })),
    };

    const results = evaluateTriggers(matchInput, pledgeRuleRows);
    const matchDate = new Date(match.datum);

    for (const result of results) {
      if (result.amountCents <= 0) continue;

      // Monthly Cap prüfen
      let cappedAmount = result.amountCents;
      const [pledgeRow] = await db
        .select({ monthlyCapCents: pledges.monthlyCapCents })
        .from(pledges)
        .where(eq(pledges.id, result.pledgeId))
        .limit(1);

      if (pledgeRow?.monthlyCapCents) {
        const alreadyCharged = await getMonthlyChargedCents(result.pledgeId, matchDate);
        const remaining = pledgeRow.monthlyCapCents - alreadyCharged;
        if (remaining <= 0) continue;
        cappedAmount = Math.min(result.amountCents, remaining);
      }

      try {
        await db.insert(charges).values({
          id: createId(),
          pledgeId: result.pledgeId,
          pledgeRuleId: result.ruleId,
          matchId: match.id,
          matchEventId: null,
          amountCents: cappedAmount,
          status: "confirmed",
          confirmedAt: new Date(),
        });
        totalCharges++;
        totalCents += cappedAmount;
      } catch (err) {
        const msg = String(err);
        if (!msg.includes("unique") && !msg.includes("duplicate")) {
          console.error(`  Charge-Fehler für ${result.ruleId}: ${err}`);
        }
      }
    }

    const matchCharges = results.reduce((s, r) => s + r.amountCents, 0);
    if (matchCharges > 0) {
      console.log(`  ✓ ${new Date(match.datum).toISOString().split('T')[0]} ${match.heimName} ${match.ergebnisHeim}:${match.ergebnisGast} ${match.gastName} → ${(matchCharges/100).toFixed(2)}€`);
    }
  }

  console.log(`\n✓ ${totalCharges} Charges erzeugt — Gesamt: ${(totalCents / 100).toFixed(2)} €`);
  console.log("\n=== FERTIG ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
