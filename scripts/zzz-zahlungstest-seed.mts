/**
 * EINMAL-SEED für die Zahlungs-/Gating-Doku (Wegwerf-Test-Verein).
 *
 * Legt EINEN klar markierten Test-Verein „__Zahlungstest Demo" an, mit:
 *  - Test-Admin-User (zahlungstest@e2e-test.kickpact.de) als Club- + Team-Admin
 *  - 1 Mannschaft, Abo im Trial (Pro), verifiziert
 *  - 7 Sponsoren mit je 1 aktiven Pact (→ über Basic-Cap 5) + 1 Sponsor mit 5
 *    Regeln (→ über Basic-Cap 3) → die FOMO-Downgrade-Verlustrechnung greift
 *
 * Idempotent: wischt vorhandene Test-Zeilen (feste IDs) zuerst weg.
 * Aufruf (Worktree): npx dotenv -e .env.local -- npx tsx scripts/zzz-zahlungstest-seed.mts
 *
 * Aufräumen danach: scripts/zzz-zahlungstest-cleanup.mts
 */
import { eq, inArray, like } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema/auth";
import { clubs, clubMemberships, teams, teamMemberships } from "@/lib/db/schema/clubs";
import { subscriptions, teamLicenses } from "@/lib/db/schema/billing";
import { sponsors } from "@/lib/db/schema/sponsors";
import { pledges, pledgeRules } from "@/lib/db/schema/pledges";

const EMAIL = "zahlungstest@e2e-test.kickpact.de";
const CLUB = "zzz_zahlungstest_club";
const TEAM = "zzz_zahlungstest_team";
const SLUG = "zzz-zahlungstest";
const LIC = "zzz_zahlungstest_lic";
const SPONSOR_PREFIX = "zzz_zahlungstest_sp_";
const N_SPONSORS = 7; // > Basic-Cap (5) → 2 Sponsoren „passen nicht mehr"

const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

async function wipe() {
  // Reihenfolge irrelevant dank Cascades, aber Sponsoren hängen am User (nicht
  // am Club) → explizit per ID-Präfix löschen. pledges/rules cascaden mit.
  const sps = await db
    .select({ id: sponsors.id })
    .from(sponsors)
    .where(like(sponsors.id, `${SPONSOR_PREFIX}%`));
  if (sps.length) {
    await db.delete(pledges).where(inArray(pledges.sponsorId, sps.map((s) => s.id)));
    await db.delete(sponsors).where(inArray(sponsors.id, sps.map((s) => s.id)));
  }
  await db.delete(clubs).where(eq(clubs.id, CLUB)); // cascade: team, sub, lic, memberships
}

async function main() {
  // Test-User (vom magic-link-stub schon angelegt) holen oder anlegen.
  let [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL)).limit(1);
  if (!u) {
    const { createId } = await import("@paralleldrive/cuid2");
    const id = createId();
    await db.insert(users).values({ id, email: EMAIL, emailVerified: true, name: "Zahlungstest Admin" });
    u = { id };
  }
  const userId = u.id;

  await wipe();

  await db.insert(clubs).values({
    id: CLUB,
    slug: SLUG,
    name: "__Zahlungstest Demo FC",
    ort: "Teststadt",
    onboardingStatus: "completed",
    onboardingRole: "mannschaft",
    verifiedAt: new Date() // verifiziert → keine Verifikations-Banner-Ablenkung
  });
  await db.insert(clubMemberships).values({ userId, clubId: CLUB, role: "admin" });

  await db.insert(teams).values({
    id: TEAM,
    clubId: CLUB,
    name: "1. Herren (Demo)",
    saison: "2627",
    isActive: true,
    dataCoverage: "full",
    // Einzel-Team-Gate prüft teams.verifiedAt (nicht clubs.verifiedAt) →
    // ohne das ist der Sponsoren-Einladen-Flow gesperrt (QA-Fund 2026-07).
    verifiedAt: new Date()
  });
  await db.insert(teamMemberships).values({ userId, teamId: TEAM, role: "admin" });

  // Abo: Pro-Trial (Standard-Startzustand „ich bin in der Testphase").
  await db.insert(subscriptions).values({
    clubId: CLUB,
    status: "trialing",
    billingCycle: "monthly",
    trialEndsAt: days(14)
  });
  await db.insert(teamLicenses).values({
    id: LIC,
    subscriptionClubId: CLUB,
    teamId: TEAM,
    plan: "pro",
    status: "trialing"
  });

  // 7 Sponsoren mit je 1 aktivem Pact; Sponsor 0 bekommt 5 Regeln.
  for (let i = 0; i < N_SPONSORS; i++) {
    const sponsorId = `${SPONSOR_PREFIX}${i}`;
    const pledgeId = `zzz_zahlungstest_pl_${i}`;
    await db.insert(sponsors).values({
      id: sponsorId,
      userId,
      displayName: `Demo-Sponsor ${i + 1}`,
      type: "familie",
      billingCycle: "monthly"
    });
    await db.insert(pledges).values({
      id: pledgeId,
      sponsorId,
      teamId: TEAM,
      status: "active",
      startsAt: new Date(),
      endsAt: days(300)
    });
    const ruleCount = i === 0 ? 5 : 1; // Sponsor 1 hat 5 Regeln → > Basic-Cap 3
    const triggers = ["goal_total", "win", "clean_sheet", "assist", "yellow_card"] as const;
    for (let r = 0; r < ruleCount; r++) {
      await db.insert(pledgeRules).values({
        pledgeId,
        triggerType: triggers[r],
        amountCents: 500,
        active: true
      });
    }
  }

  const base = "https://kickpact.schartl.dev";
  console.log("SEED OK ✓");
  console.log("  userId:", userId);
  console.log("  club:  ", CLUB, "slug:", SLUG);
  console.log("  team:  ", TEAM);
  console.log("  Sponsoren:", N_SPONSORS, "(Sponsor 1 hat 5 Regeln)");
  console.log("URLs:");
  console.log("  Dashboard:      ", `${base}/verein/${SLUG}`);
  console.log("  Team-Dashboard: ", `${base}/verein/${SLUG}/mannschaft/${TEAM}`);
  console.log("  Abo (Team):     ", `${base}/verein/${SLUG}/mannschaft/${TEAM}/abo`);
  console.log("  Abo (Club):     ", `${base}/verein/${SLUG}/abo`);
  console.log("  Sponsoren:      ", `${base}/verein/${SLUG}/mannschaft/${TEAM}/sponsoren`);
  console.log("  Preise:         ", `${base}/preise`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("SEED FAIL:", e); process.exit(1); });
