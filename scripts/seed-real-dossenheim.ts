/**
 * Seeds FC Sportfr. Dossenheim mit echten Fußball.de-Daten:
 * - Mannschaften scrapen + in DB anlegen
 * - Vergangene Spiele der Saison 2024 scrapen + importieren
 * - Fake-Sponsor-User anlegen
 * - Pledges anlegen
 * - evaluate-match für alle historischen Matches durchlaufen
 * - season_results Eintrag anlegen
 *
 * Run: cd /Users/johan/kickpact && npx dotenv -e .env.local -- npx tsx --tsconfig tsconfig.json scripts/seed-real-dossenheim.ts
 */

import { eq, inArray, and } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "../lib/db/client";
import { clubs, teams, players } from "../lib/db/schema/clubs";
import { users } from "../lib/db/schema/auth";
import { sponsors } from "../lib/db/schema/sponsors";
import { pledges, pledgeRules, triggerTypeEnum } from "../lib/db/schema/pledges";
import { matches, matchEvents } from "../lib/db/schema/matches";
import { charges } from "../lib/db/schema/charges";
import { seasonResults } from "../lib/db/schema/season-results";
import {
  getMannschaften,
  getSpiele,
  getSpielDetails,
} from "../lib/crawler/fussballde";
import {
  findMatchByFussballdeId,
  insertMatchWithEvents,
} from "../lib/db/queries/crawler";
import { evaluateTriggers, type MatchInput } from "../lib/crawler/triggers";
import {
  loadActivePledgeRulesForTeam,
  getMonthlyChargedCents,
  getPledgeMonthlyCap,
} from "../lib/db/queries/evaluation";

const CLUB_ID = "b1ockmqe5pvtdc5mhz6tfs97";
const VEREIN_ID = "00ES8GN9B800006NVV0AG08LVUPGND5I";
const VEREIN_SLUG = "fc-sportfr-dossenheim-69216-dossenheim-jpzr";
const FUSSBALLDE_SLUG = "fc-sportfr-dossenheim-baden";

// ---------------------------------------------------------------------------
// Phase 1: Mannschaften scrapen
// ---------------------------------------------------------------------------
async function seedTeams(): Promise<Array<{ id: string; name: string; fussballdeTeamId: string; fussballdeSlug: string; saison: string }>> {
  console.log("\n=== Phase 1: Mannschaften scrapen ===");

  const mannschaften = await getMannschaften(VEREIN_ID, FUSSBALLDE_SLUG);
  console.log(`Gefunden: ${mannschaften.length} Mannschaft(en) auf Fußball.de`);

  if (mannschaften.length === 0) {
    throw new Error("Keine Mannschaften gefunden – prüfe VEREIN_ID und Slug");
  }

  // Nehme die ersten 3 (oder alle falls weniger)
  const toImport = mannschaften.slice(0, 3);
  console.log("Importiere folgende Mannschaften:");
  for (const m of toImport) {
    console.log(`  - ${m.name} (teamId=${m.teamId}, saison=${m.saison})`);
  }

  const seededTeams: Array<{ id: string; name: string; fussballdeTeamId: string; fussballdeSlug: string; saison: string }> = [];

  for (const m of toImport) {
    // Upsert: prüfe ob Team bereits existiert
    const [existing] = await db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(
        and(
          eq(teams.fussballdeTeamId, m.teamId),
          eq(teams.saison, m.saison)
        )
      )
      .limit(1);

    if (existing) {
      console.log(`  ↩ Team bereits vorhanden: ${existing.name} (id=${existing.id})`);
      seededTeams.push({
        id: existing.id,
        name: existing.name,
        fussballdeTeamId: m.teamId,
        fussballdeSlug: m.slug,
        saison: m.saison,
      });
    } else {
      const [created] = await db
        .insert(teams)
        .values({
          clubId: CLUB_ID,
          name: m.name,
          saison: m.saison,
          fussballdeTeamId: m.teamId,
          fussballdeSlug: m.slug,
          isActive: true,
          discoverable: true,
        })
        .returning({ id: teams.id });
      console.log(`  ✓ Team angelegt: ${m.name} (id=${created.id})`);
      seededTeams.push({
        id: created.id,
        name: m.name,
        fussballdeTeamId: m.teamId,
        fussballdeSlug: m.slug,
        saison: m.saison,
      });
    }
  }

  console.log(`\n✓ ${seededTeams.length} Teams bereit`);
  return seededTeams;
}

// ---------------------------------------------------------------------------
// Phase 2: Spiele scrapen und importieren
// ---------------------------------------------------------------------------
async function seedMatches(
  seededTeams: Array<{ id: string; name: string; fussballdeTeamId: string; fussballdeSlug: string; saison: string }>
): Promise<number> {
  console.log("\n=== Phase 2: Spiele scrapen ===");

  let totalMatches = 0;
  let totalEvents = 0;

  for (const team of seededTeams) {
    console.log(`\n--- ${team.name} (${team.saison}) ---`);
    let spiele: Awaited<ReturnType<typeof getSpiele>>;
    try {
      spiele = await getSpiele(team.fussballdeTeamId, team.fussballdeSlug, team.saison);
    } catch (err) {
      console.error(`  ✗ Fehler beim Laden der Spielliste: ${err}`);
      continue;
    }
    console.log(`  Gefunden: ${spiele.length} vergangene Spiele`);

    const toScrape = spiele.slice(0, 15);

    for (const spiel of toScrape) {
      // Idempotenz-Check
      const existing = await findMatchByFussballdeId(spiel.spielId);
      if (existing) {
        console.log(`  ↩ ${spiel.datum} ${spiel.heim} vs ${spiel.gast} — bereits vorhanden`);
        continue;
      }

      try {
        const details = await getSpielDetails(spiel.spielId, spiel.slug);
        const { matchId, newEventCount } = await insertMatchWithEvents({
          teamId: team.id,
          listItem: spiel,
          details,
        });
        totalMatches++;
        totalEvents += newEventCount;
        const ergebnis = `${details.ergebnis.heim}:${details.ergebnis.gast}`;
        console.log(
          `  ✓ ${spiel.datum}  ${details.heim || spiel.heim} vs ${details.gast || spiel.gast}  ${ergebnis}  (${newEventCount} Events)`
        );
      } catch (err) {
        console.error(`  ✗ ${spiel.datum} ${spiel.heim} vs ${spiel.gast} — Scrape-Fehler: ${err}`);
        // Nicht abbrechen, weiter mit nächstem Spiel
      }
    }
  }

  console.log(`\n✓ ${totalMatches} neue Matches, ${totalEvents} neue Events importiert`);
  return totalMatches;
}

// ---------------------------------------------------------------------------
// Phase 3: Fake-Sponsor-User anlegen
// ---------------------------------------------------------------------------
interface SeedSponsor {
  userId: string;
  sponsorId: string;
  name: string;
  email: string;
}

async function seedSponsors(): Promise<SeedSponsor[]> {
  console.log("\n=== Phase 3: Sponsor-User anlegen ===");

  const sponsorDefs = [
    { name: "Familie Schreiber", email: "schreiber@kickpact-test.de", type: "familie" as const, businessName: null },
    { name: "Bäckerei Müller GmbH", email: "baeckerei-mueller@kickpact-test.de", type: "business" as const, businessName: "Bäckerei Müller GmbH" },
    { name: "Auto Weiss GmbH", email: "autoweiss@kickpact-test.de", type: "business" as const, businessName: "Auto Weiss GmbH" },
    { name: "Erna Kowalski", email: "erna@kickpact-test.de", type: "familie" as const, businessName: null },
  ];

  const result: SeedSponsor[] = [];

  for (const def of sponsorDefs) {
    // Check if user already exists
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, def.email))
      .limit(1);

    let userId: string;
    if (existingUser) {
      userId = existingUser.id;
      console.log(`  ↩ User bereits vorhanden: ${def.email} (id=${userId})`);
    } else {
      userId = createId();
      await db.insert(users).values({
        id: userId,
        email: def.email,
        name: def.name,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`  ✓ User angelegt: ${def.email} (id=${userId})`);
    }

    // Check if sponsor already exists
    const [existingSponsor] = await db
      .select({ id: sponsors.id })
      .from(sponsors)
      .where(eq(sponsors.userId, userId))
      .limit(1);

    let sponsorId: string;
    if (existingSponsor) {
      sponsorId = existingSponsor.id;
      console.log(`    ↩ Sponsor bereits vorhanden (id=${sponsorId})`);
    } else {
      const [createdSponsor] = await db
        .insert(sponsors)
        .values({
          userId,
          displayName: def.name,
          type: def.type,
          businessName: def.businessName ?? undefined,
        })
        .returning({ id: sponsors.id });
      sponsorId = createdSponsor.id;
      console.log(`    ✓ Sponsor angelegt (id=${sponsorId})`);
    }

    result.push({ userId, sponsorId, name: def.name, email: def.email });
  }

  console.log(`\n✓ ${result.length} Sponsoren bereit`);
  return result;
}

// ---------------------------------------------------------------------------
// Phase 4: Pledges + Rules anlegen
// ---------------------------------------------------------------------------
async function seedPledges(
  seededSponsors: SeedSponsor[],
  seededTeams: Array<{ id: string; name: string }>
): Promise<{ pledgeCount: number; ruleCount: number }> {
  console.log("\n=== Phase 4: Pledges anlegen ===");

  const [familieSchreiber, baeckerei, autoWeiss, erna] = seededSponsors;
  const team1 = seededTeams[0]; // 1. Herren (oder erstes Team)
  const team2 = seededTeams[1] ?? seededTeams[0]; // 2. Team, fallback auf 1. Herren

  const endsAt = new Date("2025-07-31T00:00:00Z");
  const startsAt = new Date("2024-08-01T00:00:00Z");

  let pledgeCount = 0;
  let ruleCount = 0;

  // Helper: Pledge anlegen (idempotent via sponsor+team check)
  async function upsertPledge(sponsorId: string, teamId: string): Promise<string> {
    const [existing] = await db
      .select({ id: pledges.id })
      .from(pledges)
      .where(and(eq(pledges.sponsorId, sponsorId), eq(pledges.teamId, teamId)))
      .limit(1);
    if (existing) return existing.id;
    const [created] = await db
      .insert(pledges)
      .values({
        sponsorId,
        teamId,
        status: "active",
        startsAt,
        endsAt,
      })
      .returning({ id: pledges.id });
    pledgeCount++;
    return created.id;
  }

  // Helper: Rule anlegen (idempotent via pledgeId+triggerType check)
  async function upsertRule(
    pledgeId: string,
    triggerType: string,
    amountCents: number,
    opts: {
      perMatchCapCents?: number | null;
      triggerParamsJson?: Record<string, unknown>;
    } = {}
  ): Promise<void> {
    const [existing] = await db
      .select({ id: pledgeRules.id })
      .from(pledgeRules)
      .where(
        and(
          eq(pledgeRules.pledgeId, pledgeId),
          eq(pledgeRules.triggerType, triggerType as (typeof triggerTypeEnum.enumValues)[number])
        )
      )
      .limit(1);
    if (existing) return;
    await db.insert(pledgeRules).values({
      pledgeId,
      triggerType: triggerType as (typeof triggerTypeEnum.enumValues)[number],
      amountCents,
      perMatchCapCents: opts.perMatchCapCents ?? null,
      triggerParamsJson: opts.triggerParamsJson ?? {},
    });
    ruleCount++;
  }

  // --- Pledge 1: Familie Schreiber → 1. Herren ---
  console.log(`\n  Pledge 1: Familie Schreiber → ${team1.name}`);
  const p1 = await upsertPledge(familieSchreiber.sponsorId, team1.id);
  // Monthly cap auf Pledge-Ebene für goal_total: setze es über die rule + monatliches Cap auf dem pledge
  // goal_total 3€, monatliches Cap 30€ auf dem pledge
  await db.update(pledges).set({ monthlyCapCents: 3000 }).where(eq(pledges.id, p1));
  await upsertRule(p1, "goal_total", 300);
  await upsertRule(p1, "win", 1000);
  console.log(`    → Pledge ${p1}: goal_total(3€) + win(10€), monthlyCapCents=30€`);

  // --- Pledge 2: Bäckerei Müller → 1. Herren ---
  console.log(`\n  Pledge 2: Bäckerei Müller → ${team1.name}`);
  const p2 = await upsertPledge(baeckerei.sponsorId, team1.id);
  await upsertRule(p2, "goal_total", 500);
  await upsertRule(p2, "clean_sheet", 1500);
  await upsertRule(p2, "comeback_win", 2000);
  await upsertRule(p2, "season_no_relegation", 5000, { triggerParamsJson: {} });
  console.log(`    → Pledge ${p2}: goal_total(5€) + clean_sheet(15€) + comeback_win(20€) + season_no_relegation(50€)`);

  // --- Pledge 3: Auto Weiss → 1. Herren ---
  console.log(`\n  Pledge 3: Auto Weiss → ${team1.name}`);
  const p3 = await upsertPledge(autoWeiss.sponsorId, team1.id);
  await upsertRule(p3, "win", 2000, { perMatchCapCents: null });
  // monthlyCapCents auf dem pledge
  await db.update(pledges).set({ monthlyCapCents: 6000 }).where(eq(pledges.id, p3));
  await upsertRule(p3, "hattrick", 5000);
  await upsertRule(p3, "season_promotion", 15000, { triggerParamsJson: {} });
  console.log(`    → Pledge ${p3}: win(20€, monatl.Cap 60€) + hattrick(50€) + season_promotion(150€)`);

  // --- Pledge 4: Erna Kowalski → 2. Team (oder 1. Herren) ---
  console.log(`\n  Pledge 4: Erna Kowalski → ${team2.name}`);
  const p4 = await upsertPledge(erna.sponsorId, team2.id);
  await upsertRule(p4, "goal_total", 200);
  await upsertRule(p4, "win", 800);
  await upsertRule(p4, "goals_scored_min", 300, { triggerParamsJson: { min: 3, minGoals: 3 } });
  console.log(`    → Pledge ${p4}: goal_total(2€) + win(8€) + goals_scored_min≥3(3€)`);

  // --- Pledge 5: Familie Schreiber → 2. Team (falls verschieden) ---
  if (team2.id !== team1.id) {
    console.log(`\n  Pledge 5: Familie Schreiber → ${team2.name}`);
    const p5 = await upsertPledge(familieSchreiber.sponsorId, team2.id);
    await upsertRule(p5, "goal_total", 200);
    await upsertRule(p5, "season_no_relegation", 3000, { triggerParamsJson: {} });
    console.log(`    → Pledge ${p5}: goal_total(2€) + season_no_relegation(30€)`);
  } else {
    console.log(`\n  Pledge 5: Familie Schreiber → (übersprungen, da nur 1 Team vorhanden)`);
  }

  // --- goal_by_player Rule: hol einen echten Torschützen aus der DB ---
  console.log(`\n  Extra: goal_by_player Rule für einen echten Spieler anlegen…`);
  const [scorer] = await db
    .select({
      playerId: matchEvents.playerId,
      playerName: matchEvents.playerName,
      fussballdePlayerId: players.fussballdePlayerId,
    })
    .from(matchEvents)
    .leftJoin(players, eq(matchEvents.playerId, players.id))
    .innerJoin(matches, eq(matchEvents.matchId, matches.id))
    .where(
      and(
        eq(matchEvents.type, "tor"),
        inArray(matches.teamId, seededTeams.map((t) => t.id))
      )
    )
    .limit(1);

  if (scorer && scorer.playerId && scorer.playerName) {
    console.log(`    Torschütze gefunden: ${scorer.playerName} (playerId=${scorer.playerId})`);
    // Füge goal_by_player Rule zum Bäckerei-Pledge hinzu
    await upsertRule(p2, "goal_by_player", 1000, {
      triggerParamsJson: {
        playerId: scorer.playerId,
        playerName: scorer.playerName,
      },
    });
    console.log(`    ✓ goal_by_player(10€) für ${scorer.playerName} zu Bäckerei-Müller-Pledge hinzugefügt`);
  } else {
    console.log("    ⚠ Kein Torschütze in DB gefunden (Pledges wurden vor Matches gesetzt?)");
  }

  console.log(`\n✓ ${pledgeCount} neue Pledges, ${ruleCount} neue Rules angelegt`);
  return { pledgeCount, ruleCount };
}

// ---------------------------------------------------------------------------
// Phase 5: evaluate-match für alle historischen Matches
// ---------------------------------------------------------------------------
async function evaluateHistoricalMatches(
  seededTeams: Array<{ id: string; name: string }>
): Promise<{ chargesGenerated: number; perSponsor: Map<string, number> }> {
  console.log("\n=== Phase 5: evaluate-match für historische Matches ===");

  const teamIds = seededTeams.map((t) => t.id);

  // Lade alle finished matches der neuen Teams
  const finishedMatches = await db
    .select()
    .from(matches)
    .where(
      and(
        inArray(matches.teamId, teamIds),
        eq(matches.status, "finished")
      )
    );

  console.log(`  ${finishedMatches.length} abgeschlossene Matches gefunden`);

  let chargesGenerated = 0;
  const perSponsor = new Map<string, number>();

  for (const match of finishedMatches) {
    const team = seededTeams.find((t) => t.id === match.teamId)!;
    // Bestimme ob unser Team Heim oder Gast ist
    const teamFirstWord = team.name.toLowerCase().split(" ")[0];
    const isHeim =
      match.heimName.toLowerCase().includes(teamFirstWord) ||
      match.heimName.toLowerCase().includes("dossenheim");
    const teamSide = isHeim ? "heim" : "gast";

    // Lade Events
    const events = await db
      .select()
      .from(matchEvents)
      .where(eq(matchEvents.matchId, match.id));

    // Lade aktive Pledge-Rules für dieses Team zum Spieltag
    const rules = await loadActivePledgeRulesForTeam(match.teamId, match.datum);

    if (rules.length === 0) continue;

    const input: MatchInput = {
      id: match.id,
      teamSide,
      ergebnisHeim: match.ergebnisHeim ?? 0,
      ergebnisGast: match.ergebnisGast ?? 0,
      halbzeitHeim: match.halbzeitHeim,
      halbzeitGast: match.halbzeitGast,
      events: events.map((e) => ({
        id: e.id,
        type: e.type,
        subtype: e.subtype ?? undefined,
        minute: e.minute,
        side: e.side,
        playerName: e.playerName ?? undefined,
        playerId: e.playerId ?? undefined,
        source: e.source,
      })),
    };

    const proposals = evaluateTriggers(input, rules);

    for (const p of proposals) {
      // Monthly cap check
      const cap = await getPledgeMonthlyCap(p.pledgeId);
      if (cap !== null) {
        const already = await getMonthlyChargedCents(p.pledgeId, match.datum);
        if (already + p.amountCents > cap) continue;
      }

      try {
        await db.insert(charges).values({
          pledgeId: p.pledgeId,
          pledgeRuleId: p.pledgeRuleId,
          matchId: p.matchId,
          matchEventId: p.matchEventId,
          triggerType: p.triggerType,
          amountCents: p.amountCents,
          status: "confirmed",
          confirmedAt: new Date(),
        });
        chargesGenerated++;

        // Track per sponsor (via pledgeId lookup)
        const existing = perSponsor.get(p.pledgeId) ?? 0;
        perSponsor.set(p.pledgeId, existing + p.amountCents);
      } catch {
        // Duplicate constraint → skip silently
      }
    }

    const ownGoals = teamSide === "heim" ? (match.ergebnisHeim ?? 0) : (match.ergebnisGast ?? 0);
    const oppGoals = teamSide === "heim" ? (match.ergebnisGast ?? 0) : (match.ergebnisHeim ?? 0);
    const ergebnis = isHeim
      ? `${match.ergebnisHeim ?? "?"}:${match.ergebnisGast ?? "?"}`
      : `${match.ergebnisGast ?? "?"}:${match.ergebnisHeim ?? "?"}`;
    const datum = match.datum.toISOString().slice(0, 10);
    console.log(
      `  ${datum}  ${match.heimName} vs ${match.gastName}  ${ergebnis} (${teamSide})  → ${proposals.length} proposals`
    );
  }

  console.log(`\n✓ ${chargesGenerated} Charges generiert`);
  return { chargesGenerated, perSponsor };
}

// ---------------------------------------------------------------------------
// Phase 6: Season-Results (pending)
// ---------------------------------------------------------------------------
async function seedSeasonResults(
  seededTeams: Array<{ id: string; name: string; saison: string }>
): Promise<void> {
  console.log("\n=== Phase 6: Season-Results anlegen ===");

  const team1 = seededTeams[0];

  // Check if already exists
  const [existing] = await db
    .select({ id: seasonResults.id })
    .from(seasonResults)
    .where(and(eq(seasonResults.teamId, team1.id), eq(seasonResults.saison, team1.saison)))
    .limit(1);

  if (existing) {
    console.log(`  ↩ Season-Result für ${team1.name} (${team1.saison}) bereits vorhanden`);
    return;
  }

  await db.insert(seasonResults).values({
    teamId: team1.id,
    saison: team1.saison,
    promoted: false,
    relegated: false,
    finalPosition: 4,
    teamsInLeague: 12,
  });
  console.log(`  ✓ Season-Result für ${team1.name} (${team1.saison}): Platz 4, Klasse erhalten`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   KickPact — Real Dossenheim Seed            ║");
  console.log("╚══════════════════════════════════════════════╝");

  // Phase 1: Teams
  const seededTeams = await seedTeams();

  // Phase 2: Matches
  const newMatchCount = await seedMatches(seededTeams);

  // Phase 3: Sponsors
  const seededSponsors = await seedSponsors();

  // Phase 4: Pledges
  const { pledgeCount, ruleCount } = await seedPledges(seededSponsors, seededTeams);

  // Phase 5: Evaluate historical matches
  const { chargesGenerated, perSponsor } = await evaluateHistoricalMatches(seededTeams);

  // Phase 6: Season results
  await seedSeasonResults(seededTeams);

  // Final summary
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   ZUSAMMENFASSUNG                             ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`Teams angelegt:       ${seededTeams.length}`);
  console.log(`Neue Matches:         ${newMatchCount}`);
  console.log(`Pledges angelegt:     ${pledgeCount}`);
  console.log(`Pledge-Rules:         ${ruleCount}`);
  console.log(`Charges generiert:    ${chargesGenerated}`);

  // Per-Sponsor summary via join
  if (perSponsor.size > 0) {
    console.log("\nCharges nach Pledge:");
    for (const [pledgeId, cents] of perSponsor.entries()) {
      console.log(`  Pledge ${pledgeId}: ${(cents / 100).toFixed(2)} €`);
    }
  }

  console.log("\n✓ Seed abgeschlossen");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
