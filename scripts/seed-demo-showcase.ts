/**
 * Seed einer KOMPLETT ERFUNDENEN Demo-Mannschaft für Marketing-Screenshots.
 *
 * "FC Beispielhausen — 1. Herren": voller Saison-Datenbestand (12 gespielte
 * Spiele mit Torschützen, 3 kommende Spiele, 4 Sponsoren mit Pacts, Beiträge),
 * fertig eingerichtet (verifiziert, IBAN gesetzt, Abo aktiv).
 *
 * HARTE REGELN
 *  - Kein Netzwerk, kein Crawler: reine DB-Inserts mit erfundenen Daten.
 *  - Fasst NIEMALS fremde Zeilen an. Alles hängt am Club-Slug/den festen IDs
 *    unten; `cleanup()` löscht ausschließlich diese.
 *  - `fussballdeTeamId` bleibt NULL — damit fasst der Crawler (getActiveTeams
 *    filtert auf non-null) die Demo nie an und es existiert keine erfundene
 *    fussball.de-ID, die auf ein echtes Team zeigen könnte.
 *  - Beiträge werden NICHT von Hand gerechnet, sondern von der echten
 *    Trigger-Engine (`evaluateTriggers`) aus Events + Regeln abgeleitet.
 *    Damit sind Regel, Spielbericht und Betrag per Konstruktion konsistent.
 *
 * Run:
 *   npx dotenv -e .env.local -- npx tsx --tsconfig tsconfig.json scripts/seed-demo-showcase.ts
 */
import { eq, inArray, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "../lib/db/client";
import { clubs, teams, players, clubMemberships, teamMemberships } from "../lib/db/schema/clubs";
import { users } from "../lib/db/schema/auth";
import { subscriptions, teamLicenses } from "../lib/db/schema/billing";
import { sponsors } from "../lib/db/schema/sponsors";
import { pledges, pledgeRules, triggerTypeEnum } from "../lib/db/schema/pledges";
import { matches, matchEvents } from "../lib/db/schema/matches";
import { charges } from "../lib/db/schema/charges";
import { seasonResults } from "../lib/db/schema/season-results";
import { teamStandings } from "../lib/db/schema/standings";
import { storeStandings } from "../lib/db/queries/standings";
import { loadActivePledgeRulesForTeam } from "../lib/db/queries/evaluation";
import { evaluateTriggers, type MatchInput } from "../lib/crawler/triggers";
import { detectTeamSide } from "../lib/crawler/team-side";

// ---------------------------------------------------------------------------
// Feste Marker — der einzige Anker für Idempotenz UND für das Aufräumen.
// Feste IDs, damit die Screenshot-URLs über Neuläufe stabil bleiben.
// ---------------------------------------------------------------------------
const CLUB_ID = "demoshowcaseclub000000001";
const TEAM_ID = "demoshowcaseteam000000001";
const CLUB_SLUG = "fc-beispielhausen-demo";
const CLUB_NAME = "FC Beispielhausen";
const TEAM_NAME = "1. Herren";
const SAISON = "2526";
const LEAGUE = "Kreisliga A Beispielkreis";

const OWNER_EMAIL = "demo-showcase@kickpact.example";

type TriggerName = (typeof triggerTypeEnum.enumValues)[number];

interface SponsorDef {
  email: string;
  name: string;
  role: string;
  description: string;
  rules: Array<{
    trigger: TriggerName;
    amountCents: number;
    params?: Record<string, unknown>;
  }>;
}

// Alle Demo-User leben unter @kickpact.example (reservierte TLD, nie zustellbar).
const SPONSOR_DEFS: SponsorDef[] = [
  {
    email: "klaus.berger@kickpact.example",
    name: "Klaus Berger",
    role: "fan",
    description: "Steht seit 30 Jahren am Zaun",
    rules: [
      { trigger: "goal_total", amountCents: 500 },
      { trigger: "win", amountCents: 1000 }
    ]
  },
  {
    email: "sabine.vogt@kickpact.example",
    name: "Sabine Vogt",
    role: "verwandt",
    description: "Mama von Jonas",
    rules: [
      // playerId wird nach dem Kader-Insert nachgetragen (siehe seedPledges).
      { trigger: "goal_by_player", amountCents: 300, params: { playerName: "Jonas Wittmann" } },
      { trigger: "clean_sheet", amountCents: 500 }
    ]
  },
  {
    email: "michael.hofmann@kickpact.example",
    name: "Michael Hofmann",
    role: "freund",
    description: "Ex-Torwart der Ersten",
    rules: [
      { trigger: "away_win", amountCents: 800 },
      { trigger: "hattrick", amountCents: 2000 },
      { trigger: "comeback_win", amountCents: 1500 },
      { trigger: "season_no_relegation", amountCents: 5000 }
    ]
  },
  {
    email: "familie.neumann@kickpact.example",
    name: "Familie Neumann",
    role: "verwandt",
    description: "Eltern von Tobias",
    rules: [
      { trigger: "goal_total", amountCents: 200 },
      { trigger: "goals_scored_min", amountCents: 500, params: { minGoals: 3 } }
    ]
  }
];

const DEMO_EMAILS = [OWNER_EMAIL, ...SPONSOR_DEFS.map((s) => s.email)];

// ---------------------------------------------------------------------------
// Kader (erfunden). Reihenfolge = Anzeige im Roster.
// ---------------------------------------------------------------------------
const ROSTER = [
  "Max Dörfler",
  "Nico Hartl",
  "Sebastian Vogler",
  "Elias Wagner",
  "Kevin Mauer",
  "Andreas Pfeiffer",
  "Timo Lehmann",
  "Robin Kessler",
  "Fabian Krüger",
  "Luca Brenner",
  "Tobias Reinhardt",
  "Deniz Yalcin",
  "Marco Steinbach",
  "Jonas Wittmann"
];

// ---------------------------------------------------------------------------
// Spielplan (erfunden). Bilanz 7/3/2, 26:15 — bewusst positiv, aber nicht
// absurd. Torschützen summieren sich exakt auf `own`, die Halbzeitstände sind
// mit der Tor-Chronologie konsistent (sonst würde comeback_win lügen).
// ---------------------------------------------------------------------------
interface FixtureDef {
  date: string;
  home: boolean;
  opponent: string;
  own: number;
  opp: number;
  ownHt: number;
  oppHt: number;
  /** [Minute, Spielername] je eigenem Tor. */
  scorers: Array<[number, string]>;
}

const PLAYED: FixtureDef[] = [
  { date: "2025-08-17T13:00", home: true, opponent: "SV Musterdorf", own: 3, opp: 1, ownHt: 1, oppHt: 1,
    scorers: [[12, "Jonas Wittmann"], [58, "Marco Steinbach"], [77, "Jonas Wittmann"]] },
  { date: "2025-08-24T15:00", home: false, opponent: "TSV Musterbach", own: 1, opp: 2, ownHt: 0, oppHt: 1,
    scorers: [[66, "Deniz Yalcin"]] },
  { date: "2025-09-07T15:00", home: true, opponent: "SG Beispieltal", own: 2, opp: 0, ownHt: 1, oppHt: 0,
    scorers: [[23, "Jonas Wittmann"], [71, "Tobias Reinhardt"]] },
  { date: "2025-09-21T15:00", home: false, opponent: "FC Musterstadt", own: 2, opp: 1, ownHt: 0, oppHt: 1,
    scorers: [[55, "Jonas Wittmann"], [88, "Marco Steinbach"]] },
  { date: "2025-10-05T15:00", home: true, opponent: "SV Neubeispiel", own: 1, opp: 1, ownHt: 1, oppHt: 0,
    scorers: [[30, "Fabian Krüger"]] },
  { date: "2025-10-19T14:30", home: false, opponent: "TuS Musterheim", own: 4, opp: 2, ownHt: 2, oppHt: 1,
    scorers: [[8, "Jonas Wittmann"], [40, "Jonas Wittmann"], [63, "Jonas Wittmann"], [80, "Deniz Yalcin"]] },
  { date: "2025-11-02T14:30", home: true, opponent: "VfB Beispielberg", own: 0, opp: 0, ownHt: 0, oppHt: 0,
    scorers: [] },
  { date: "2025-11-16T14:00", home: false, opponent: "SpVgg Musterau", own: 0, opp: 3, ownHt: 0, oppHt: 2,
    scorers: [] },
  { date: "2026-03-08T14:30", home: true, opponent: "FC Beispielfeld", own: 3, opp: 0, ownHt: 2, oppHt: 0,
    scorers: [[15, "Marco Steinbach"], [33, "Jonas Wittmann"], [84, "Luca Brenner"]] },
  { date: "2026-03-22T15:00", home: false, opponent: "TSV Musterhofen", own: 2, opp: 2, ownHt: 1, oppHt: 2,
    scorers: [[25, "Deniz Yalcin"], [70, "Jonas Wittmann"]] },
  { date: "2026-04-12T15:00", home: true, opponent: "SV Beispielried", own: 5, opp: 1, ownHt: 3, oppHt: 0,
    scorers: [[11, "Jonas Wittmann"], [27, "Marco Steinbach"], [44, "Deniz Yalcin"], [59, "Tobias Reinhardt"], [75, "Tobias Reinhardt"]] },
  { date: "2026-05-10T15:00", home: false, opponent: "SG Musterwald", own: 3, opp: 2, ownHt: 1, oppHt: 2,
    scorers: [[20, "Marco Steinbach"], [68, "Jonas Wittmann"], [85, "Jonas Wittmann"]] }
];

/**
 * Kommende Spiele. Sie liegen zwangsläufig in der FOLGE-Saison (26/27): heute
 * ist Sommerpause, ein Saison-Fenster kann nicht gleichzeitig eine volle
 * Rückschau und Zukunft enthalten. Die „Bevorstehendes Spiel"-Karte auf der
 * Team-Übersicht ist saison-agnostisch (getNextMatchForTeam) und zeigt sie
 * trotzdem; in der Spiele-Liste stehen sie hinter der 26/27-Pille.
 */
const UPCOMING: Array<{ date: string; home: boolean; opponent: string }> = [
  { date: "2026-08-16T15:00", home: true, opponent: "SV Musterdorf" },
  { date: "2026-08-23T15:00", home: false, opponent: "TSV Musterbach" },
  { date: "2026-09-06T15:00", home: true, opponent: "SG Beispieltal" }
];

/** Liga-Tabelle 25/26 — muss exakt zu PLAYED passen (siehe assertConsistency). */
const LEAGUE_TABLE: Array<[string, number, number, number, number, number, number]> = [
  // name, spiele, siege, unentschieden, niederlagen, toreFor, toreAgainst
  ["TSV Musterbach", 12, 9, 2, 1, 31, 12],
  ["SpVgg Musterau", 12, 8, 2, 2, 28, 13],
  [CLUB_NAME, 12, 7, 3, 2, 26, 15],
  ["FC Musterstadt", 12, 7, 1, 4, 24, 17],
  ["SG Musterwald", 12, 6, 2, 4, 22, 18],
  ["TuS Musterheim", 12, 5, 3, 4, 21, 19],
  ["SV Musterdorf", 12, 5, 2, 5, 19, 20],
  ["VfB Beispielberg", 12, 4, 4, 4, 15, 16],
  ["TSV Musterhofen", 12, 4, 3, 5, 18, 21],
  ["SG Beispieltal", 12, 3, 4, 5, 14, 19],
  ["FC Beispielfeld", 12, 3, 2, 7, 13, 24],
  ["SV Neubeispiel", 12, 2, 4, 6, 12, 23],
  ["SV Beispielried", 12, 2, 2, 8, 11, 28],
  ["SC Musterbrunn", 12, 1, 2, 9, 9, 31]
];

const eur = (c: number) => (c / 100).toFixed(2).replace(".", ",") + " €";

// ---------------------------------------------------------------------------
// Selbst-Check: die Fixtures dürfen sich nicht widersprechen. Ein Screenshot
// mit unstimmigen Zahlen ist schlimmer als keiner — Leute rechnen ihn nach.
// ---------------------------------------------------------------------------
function assertConsistency(): void {
  let w = 0, d = 0, l = 0, gf = 0, ga = 0;
  for (const m of PLAYED) {
    if (m.scorers.length !== m.own) {
      throw new Error(`${m.date}: ${m.scorers.length} Torschützen, aber Endstand sagt ${m.own} Tore`);
    }
    const beforeHt = m.scorers.filter(([min]) => min <= 45).length;
    if (beforeHt !== m.ownHt) {
      throw new Error(`${m.date}: ${beforeHt} Tore bis zur 45., Halbzeitstand sagt ${m.ownHt}`);
    }
    if (m.oppHt > m.opp) throw new Error(`${m.date}: Gegner-Halbzeit > Gegner-Endstand`);
    for (const [, name] of m.scorers) {
      if (!ROSTER.includes(name)) throw new Error(`${m.date}: Torschütze ${name} nicht im Kader`);
    }
    gf += m.own; ga += m.opp;
    if (m.own > m.opp) w++; else if (m.own < m.opp) l++; else d++;
  }
  const own = LEAGUE_TABLE.find(([n]) => n === CLUB_NAME);
  if (!own) throw new Error("Eigene Zeile fehlt in der Liga-Tabelle");
  const [, spiele, siege, unent, nied, toreFor, toreAgainst] = own;
  if (spiele !== PLAYED.length || siege !== w || unent !== d || nied !== l || toreFor !== gf || toreAgainst !== ga) {
    throw new Error(
      `Liga-Tabelle widerspricht dem Spielplan: Tabelle ${spiele}/${siege}/${unent}/${nied} ${toreFor}:${toreAgainst}` +
        ` vs. Spiele ${PLAYED.length}/${w}/${d}/${l} ${gf}:${ga}`
    );
  }
  console.log(`  ✓ Fixture-Selbstcheck: ${PLAYED.length} Spiele, Bilanz ${w}/${d}/${l}, Tore ${gf}:${ga}`);
}

// ---------------------------------------------------------------------------
// Phase 0: Aufräumen. Löscht AUSSCHLIESSLICH die eigenen Zeilen.
// ---------------------------------------------------------------------------
async function cleanup(): Promise<{ preservedLogoUrl: string | null }> {
  console.log("\n=== Phase 0: eigene Demo-Zeilen löschen ===");

  const [existingTeam] = await db
    .select({ logoUrl: teams.logoUrl })
    .from(teams)
    .where(eq(teams.id, TEAM_ID))
    .limit(1);
  const preservedLogoUrl = existingTeam?.logoUrl ?? null;
  if (preservedLogoUrl) console.log(`  ↩ Logo-Key gemerkt (überlebt den Neulauf): ${preservedLogoUrl}`);

  // invoice_items → charges hat onDelete: restrict. Falls je ein Rechnungslauf
  // über die Demo lief, blockierte er sonst das Löschen der Beiträge.
  await db.execute(sql`
    DELETE FROM invoice_items
    WHERE invoice_id IN (SELECT id FROM invoices WHERE club_id = ${CLUB_ID})
  `);
  await db.execute(sql`DELETE FROM invoices WHERE club_id = ${CLUB_ID}`);

  // team_standings hat bewusst keinen FK (reiner Cache) → explizit löschen.
  await db.delete(teamStandings).where(eq(teamStandings.teamId, TEAM_ID));

  // clubs → teams → matches/match_events/players/pledges/charges/season_results,
  // subscriptions, memberships hängen alle an ON DELETE CASCADE.
  const deletedClubs = await db
    .delete(clubs)
    .where(eq(clubs.slug, CLUB_SLUG))
    .returning({ id: clubs.id });

  // users → sponsors → (falls noch da) pledges → charges, ebenfalls per Cascade.
  const deletedUsers = await db
    .delete(users)
    .where(inArray(users.email, DEMO_EMAILS))
    .returning({ id: users.id });

  console.log(`  ✓ ${deletedClubs.length} Club, ${deletedUsers.length} User entfernt (inkl. Cascade)`);
  return { preservedLogoUrl };
}

// ---------------------------------------------------------------------------
// Phase 1: Verein, Abo, Mannschaft, Owner
// ---------------------------------------------------------------------------
async function seedClubAndTeam(preservedLogoUrl: string | null): Promise<void> {
  console.log("\n=== Phase 1: Verein + Mannschaft + Owner ===");
  const now = new Date();

  await db.insert(clubs).values({
    id: CLUB_ID,
    slug: CLUB_SLUG,
    name: CLUB_NAME,
    ort: "Beispielhausen",
    // Rechnungsdaten vollständig → Checklisten-Punkt "IBAN / Rechnungsdaten" erledigt.
    // IBAN ist eine offizielle Test-IBAN (prüfsummen-gültig, kein echtes Konto).
    iban: "DE02120300000000202051",
    addressJson: { street: "Am Sportplatz 1", zip: "69123", city: "Beispielhausen", country: "DE" },
    isSmallBusiness: true,
    descriptionMd: "Erfundener Demo-Verein für Produkt-Screenshots. Keine echten Daten.",
    verifiedAt: now,
    onboardingStatus: "completed",
    onboardingRole: "verein",
    onboardingCompletedAt: now
  });

  // Aktives Abo → kein Subscription-Gate, keine Read-Only-Banner.
  await db.insert(subscriptions).values({
    clubId: CLUB_ID,
    status: "active",
    billingCycle: "monthly",
    currentPeriodEnd: new Date("2027-06-30T00:00:00Z")
  });

  await db.insert(teams).values({
    id: TEAM_ID,
    clubId: CLUB_ID,
    name: TEAM_NAME,
    saison: SAISON,
    // NULL: hält den Crawler (getActiveTeams filtert non-null) von der Demo fern
    // und erfindet keine fussball.de-ID.
    fussballdeTeamId: null,
    fussballdeSlug: null,
    isActive: true,
    // false: die Demo soll nicht in der echten Sponsor-Suche auftauchen.
    discoverable: false,
    league: LEAGUE,
    dataCoverage: "full",
    verifiedAt: now,
    logoUrl: preservedLogoUrl,
    crawlCompletedAt: now,
    showInsights: true
  });

  await db.insert(teamLicenses).values({
    subscriptionClubId: CLUB_ID,
    teamId: TEAM_ID,
    plan: "pro",
    status: "active"
  });

  const ownerId = createId();
  await db.insert(users).values({
    id: ownerId,
    email: OWNER_EMAIL,
    name: "Demo Showcase",
    emailVerified: true,
    primaryRole: `club:${CLUB_SLUG}`
  });
  await db.insert(clubMemberships).values({ userId: ownerId, clubId: CLUB_ID, role: "admin" });
  await db.insert(teamMemberships).values({ userId: ownerId, teamId: TEAM_ID, role: "admin" });

  console.log(`  ✓ ${CLUB_NAME} / ${TEAM_NAME} (Saison ${SAISON}), Abo aktiv, verifiziert`);
  console.log(`  ✓ Owner ${OWNER_EMAIL} als Vereins-Admin verknüpft`);
}

// ---------------------------------------------------------------------------
// Phase 2: Kader
// ---------------------------------------------------------------------------
async function seedRoster(): Promise<Map<string, string>> {
  console.log("\n=== Phase 2: Kader ===");
  const rows = ROSTER.map((name) => ({ id: createId(), teamId: TEAM_ID, name }));
  await db.insert(players).values(rows);
  console.log(`  ✓ ${rows.length} Spieler angelegt`);
  return new Map(rows.map((r) => [r.name, r.id]));
}

// ---------------------------------------------------------------------------
// Phase 3: Spiele + Torschützen
// ---------------------------------------------------------------------------
function heimGast(f: { home: boolean; opponent: string }): { heimName: string; gastName: string } {
  return f.home
    ? { heimName: CLUB_NAME, gastName: f.opponent }
    : { heimName: f.opponent, gastName: CLUB_NAME };
}

async function seedMatches(playerIds: Map<string, string>): Promise<void> {
  console.log("\n=== Phase 3: Spiele + Torschützen ===");

  for (const [i, f] of PLAYED.entries()) {
    const { heimName, gastName } = heimGast(f);
    const matchId = createId();
    await db.insert(matches).values({
      id: matchId,
      teamId: TEAM_ID,
      fussballdeSpielId: `DEMO-SHOWCASE-P${String(i + 1).padStart(2, "0")}`,
      datum: new Date(f.date),
      heimName,
      gastName,
      ergebnisHeim: f.home ? f.own : f.opp,
      ergebnisGast: f.home ? f.opp : f.own,
      halbzeitHeim: f.home ? f.ownHt : f.oppHt,
      halbzeitGast: f.home ? f.oppHt : f.ownHt,
      status: "finished",
      competitionType: "league"
    });

    if (f.scorers.length > 0) {
      await db.insert(matchEvents).values(
        f.scorers.map(([minute, name]) => ({
          matchId,
          minute,
          type: "tor" as const,
          side: (f.home ? "heim" : "gast") as "heim" | "gast",
          playerName: name,
          playerId: playerIds.get(name)!,
          // "scraped" = offizieller Spielbericht → Auto-Confirm ohne Sponsor-Freigabe.
          source: "scraped" as const
        }))
      );
    }
    console.log(
      `  ✓ ${f.date.slice(0, 10)}  ${heimName} ${f.home ? f.own : f.opp}:${f.home ? f.opp : f.own} ${gastName}  (${f.scorers.length} Torschützen)`
    );
  }

  for (const [i, f] of UPCOMING.entries()) {
    const { heimName, gastName } = heimGast(f);
    await db.insert(matches).values({
      id: createId(),
      teamId: TEAM_ID,
      fussballdeSpielId: `DEMO-SHOWCASE-U${String(i + 1).padStart(2, "0")}`,
      datum: new Date(f.date),
      heimName,
      gastName,
      status: "scheduled",
      competitionType: "league"
    });
    console.log(`  ✓ ${f.date.slice(0, 10)}  ${heimName} vs ${gastName}  (kommend)`);
  }
}

// ---------------------------------------------------------------------------
// Phase 4: Liga-Tabelle + Saison-Endstand
// ---------------------------------------------------------------------------
async function seedStandings(): Promise<void> {
  console.log("\n=== Phase 4: Liga-Tabelle + Saison-Endstand ===");

  const rows = LEAGUE_TABLE.map(([teamName, spiele, siege, unentschieden, niederlagen, toreFor, toreAgainst], i) => ({
    position: i + 1,
    teamName,
    teamId: null,
    spiele,
    siege,
    unentschieden,
    niederlagen,
    toreFor,
    toreAgainst,
    punkte: siege * 3 + unentschieden
  }));
  const ownRow = rows.find((r) => r.teamName === CLUB_NAME)!;

  await storeStandings(TEAM_ID, SAISON, {
    teamsInLeague: rows.length,
    rows,
    ownRow
  });
  console.log(`  ✓ Tabelle: Platz ${ownRow.position} von ${rows.length}, ${ownRow.punkte} Punkte`);

  await db.insert(seasonResults).values({
    teamId: TEAM_ID,
    saison: SAISON,
    finalPosition: ownRow.position,
    teamsInLeague: rows.length,
    promoted: false,
    relegated: false,
    evaluatedAt: new Date("2026-06-01T00:00:00Z")
  });
  console.log(`  ✓ Saison-Endstand ${SAISON}: Platz ${ownRow.position}, Klasse gehalten`);
}

// ---------------------------------------------------------------------------
// Phase 5: Sponsoren + Pacts
// ---------------------------------------------------------------------------
async function seedPledges(playerIds: Map<string, string>): Promise<void> {
  console.log("\n=== Phase 5: Sponsoren + Pacts ===");

  const startsAt = new Date("2025-08-01T00:00:00Z");
  const endsAt = new Date("2026-06-30T23:59:59Z");

  for (const def of SPONSOR_DEFS) {
    const userId = createId();
    await db.insert(users).values({
      id: userId,
      email: def.email,
      name: def.name,
      emailVerified: true,
      primaryRole: "sponsor"
    });
    const [sponsor] = await db
      .insert(sponsors)
      .values({
        userId,
        displayName: def.name,
        type: "familie",
        role: def.role,
        description: def.description
      })
      .returning({ id: sponsors.id });

    const [pledge] = await db
      .insert(pledges)
      .values({
        sponsorId: sponsor.id,
        teamId: TEAM_ID,
        status: "active",
        startsAt,
        endsAt,
        // Bewusst kein Cap: der Screenshot soll die Regeln 1:1 abbilden.
        monthlyCapCents: null
      })
      .returning({ id: pledges.id });

    for (const rule of def.rules) {
      const params = { ...(rule.params ?? {}) };
      // goal_by_player: auf die echte playerId umhängen (stabiler als der Name).
      if (typeof params.playerName === "string") {
        params.playerId = playerIds.get(params.playerName)!;
      }
      await db.insert(pledgeRules).values({
        pledgeId: pledge.id,
        triggerType: rule.trigger,
        amountCents: rule.amountCents,
        triggerParamsJson: params,
        effectiveFrom: startsAt
      });
    }
    console.log(
      `  ✓ ${def.name}: ${def.rules.map((r) => `${r.trigger} ${eur(r.amountCents)}`).join(", ")}`
    );
  }
}

// ---------------------------------------------------------------------------
// Phase 6: Beiträge — von der echten Engine, nicht von Hand.
// ---------------------------------------------------------------------------
async function seedCharges(): Promise<number> {
  console.log("\n=== Phase 6: Beiträge (Trigger-Engine) ===");

  const playedRows = await db
    .select()
    .from(matches)
    .where(eq(matches.teamId, TEAM_ID));

  let total = 0;
  let count = 0;

  for (const match of playedRows.filter((m) => m.status === "finished").sort((a, b) => +a.datum - +b.datum)) {
    const events = await db.select().from(matchEvents).where(eq(matchEvents.matchId, match.id));
    const rules = await loadActivePledgeRulesForTeam(TEAM_ID, match.datum);
    const input: MatchInput = {
      id: match.id,
      teamSide: detectTeamSide([TEAM_NAME, CLUB_NAME], match.heimName),
      ergebnisHeim: match.ergebnisHeim ?? 0,
      ergebnisGast: match.ergebnisGast ?? 0,
      halbzeitHeim: match.halbzeitHeim,
      halbzeitGast: match.halbzeitGast,
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

    const proposals = evaluateTriggers(input, rules);
    if (proposals.length === 0) continue;

    // Wie evaluate-match: der Beitrag wird direkt nach dem Spiel bestätigt.
    // Damit landen die Beiträge in der Rechnungsperiode ihres Spielmonats
    // statt alle im Seed-Monat.
    const confirmedAt = new Date(match.datum.getTime() + 2 * 60 * 60 * 1000);
    await db.insert(charges).values(
      proposals.map((p) => ({
        pledgeId: p.pledgeId,
        pledgeRuleId: p.pledgeRuleId,
        matchId: p.matchId,
        matchEventId: p.matchEventId,
        goalIndex: p.goalIndex ?? 0,
        triggerType: p.triggerType,
        amountCents: p.amountCents,
        // Alle Demo-Regeln laufen auf gescrapter Evidenz → nie approval-pflichtig.
        status: p.requiresApproval ? ("pending_approval" as const) : ("confirmed" as const),
        confirmedAt: p.requiresApproval ? null : confirmedAt,
        createdAt: confirmedAt
      }))
    );
    const sum = proposals.reduce((s, p) => s + p.amountCents, 0);
    total += sum;
    count += proposals.length;
    console.log(
      `  ${match.datum.toISOString().slice(0, 10)}  ${match.heimName} ${match.ergebnisHeim}:${match.ergebnisGast} ${match.gastName}  → ${proposals.length} Beiträge, ${eur(sum)}`
    );
  }

  // Saison-Wette: evaluate-season läuft nicht im Seed → die eine Saison-Charge
  // (Klasse gehalten, s. season_results) direkt setzen.
  const seasonRules = await db
    .select({ id: pledgeRules.id, pledgeId: pledgeRules.pledgeId, amountCents: pledgeRules.amountCents, triggerType: pledgeRules.triggerType })
    .from(pledgeRules)
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .where(eq(pledges.teamId, TEAM_ID));

  for (const r of seasonRules.filter((r) => r.triggerType === "season_no_relegation")) {
    await db.insert(charges).values({
      pledgeId: r.pledgeId,
      pledgeRuleId: r.id,
      matchId: null,
      saison: SAISON,
      triggerType: r.triggerType,
      amountCents: r.amountCents,
      status: "confirmed",
      confirmedAt: new Date("2026-06-01T00:00:00Z"),
      createdAt: new Date("2026-06-01T00:00:00Z")
    });
    total += r.amountCents;
    count++;
    console.log(`  Saison ${SAISON}  season_no_relegation erfüllt → ${eur(r.amountCents)}`);
  }

  console.log(`\n  ✓ ${count} Beiträge, Summe ${eur(total)}`);
  return total;
}

// ---------------------------------------------------------------------------
async function main() {
  console.log("╔════════════════════════════════════════════════╗");
  console.log("║   KickPact — Demo-Showcase-Seed (erfunden)     ║");
  console.log("╚════════════════════════════════════════════════╝");

  assertConsistency();

  const { preservedLogoUrl } = await cleanup();
  await seedClubAndTeam(preservedLogoUrl);
  const playerIds = await seedRoster();
  await seedMatches(playerIds);
  await seedStandings();
  await seedPledges(playerIds);
  const total = await seedCharges();

  const base = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  console.log("\n╔════════════════════════════════════════════════╗");
  console.log("║   FERTIG                                        ║");
  console.log("╚════════════════════════════════════════════════╝");
  console.log(`club-id:     ${CLUB_ID}`);
  console.log(`club-slug:   ${CLUB_SLUG}`);
  console.log(`team-id:     ${TEAM_ID}`);
  console.log(`Login (E2E-Bypass): ${OWNER_EMAIL}`);
  console.log(`Sponsor-Beiträge gesamt: ${eur(total)}`);
  console.log("");
  console.log(`Dashboard:        ${base}/verein/${CLUB_SLUG}/mannschaft/${TEAM_ID}`);
  console.log(`Spiele-Übersicht: ${base}/verein/${CLUB_SLUG}/mannschaft/${TEAM_ID}/spiele`);
  console.log(`Sponsoren:        ${base}/verein/${CLUB_SLUG}/mannschaft/${TEAM_ID}/sponsoren`);
  console.log(`Spieler:          ${base}/verein/${CLUB_SLUG}/mannschaft/${TEAM_ID}/spieler`);
  console.log("");
  console.log("So löschst du alles wieder: npx dotenv -e .env.local -- npx tsx --tsconfig tsconfig.json scripts/seed-demo-showcase.ts --cleanup-only");
  process.exit(0);
}

async function cleanupOnly() {
  console.log("=== Nur aufräumen ===");
  await cleanup();
  console.log("✓ Demo-Daten entfernt.");
  process.exit(0);
}

const run = process.argv.includes("--cleanup-only") ? cleanupOnly : main;
run().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
