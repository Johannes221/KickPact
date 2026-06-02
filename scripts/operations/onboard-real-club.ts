#!/usr/bin/env tsx
/**
 * onboard-real-club — CLI für KickPact Beta-Onboarding eines echten Vereins.
 *
 * Was es tut (in dieser Reihenfolge):
 *   1. Better-Auth-User für den Trainer anlegen (oder existierenden finden).
 *   2. Magic-Link für Trainer per Resend versenden (oder bei --dry-run drucken).
 *   3. Verein auf Fußball.de suchen (searchVereine), Match raussuchen,
 *      clubs-Row + slug anlegen.
 *   4. Trainer als clubMemberships(role=admin) verlinken.
 *   5. 30-Tage-Trial-Subscription anlegen (subscriptions.status="trialing").
 *   6. Erste Mannschaft (aus getMannschaften) als Default-Team importieren
 *      und team_licenses(plan="basic", status="trialing") anlegen.
 *   7. Sponsor-Einladungslink generieren + im Terminal ausgeben.
 *
 * Flags:
 *   --name "<Vereinsname>"          (required, exakt der Suchbegriff für Fußball.de)
 *   --trainer-email <email>         (required)
 *   --trainer-name "<Name>"         (optional, Default = E-Mail-Prefix)
 *   --plan basic|pro|verein         (optional, Default = basic)
 *   --cycle monthly|season_end      (optional, Default = monthly)
 *   --dry-run                       (optional: simuliert alles, kein DB-Write, kein Mail)
 *   --with-test-sponsor             (optional: legt zusätzlich 1 Test-Sponsor mit 1 Beispiel-Pledge an)
 *   --skip-crawler                  (optional: überspringt Fußball.de-Crawler, legt nur
 *                                   Club + User an. Nützlich falls fussball.de captcha
 *                                   wirft oder der Verein noch nicht dort gelistet ist.)
 *
 * Ausführung (mit ENV aus .env.local):
 *   npx dotenv -e .env.local -- npx tsx scripts/operations/onboard-real-club.ts \
 *     --name "FC Sportfreunde 1910 Dossenheim" \
 *     --trainer-email trainer@dossenheim.test
 *
 * Dry-Run (ohne DB / Mail, nur Crawler + Output):
 *   npx tsx scripts/operations/onboard-real-club.ts \
 *     --name "FC Sportfreunde 1910 Dossenheim" \
 *     --trainer-email trainer@dossenheim.test \
 *     --dry-run --skip-crawler
 */

import { randomBytes } from "node:crypto";

// ──────────────────────────────────────────────────────────────────────────────
// CLI-Args parsen (manuell, ohne extra Dep)
// ──────────────────────────────────────────────────────────────────────────────

interface Args {
  name: string;
  trainerEmail: string;
  trainerName: string | null;
  plan: "basic" | "pro" | "verein";
  cycle: "monthly" | "season_end";
  dryRun: boolean;
  withTestSponsor: boolean;
  skipCrawler: boolean;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const flags = new Map<string, string | true>();

  for (let i = 0; i < argv.length; i++) {
    const cur = argv[i];
    if (!cur.startsWith("--")) continue;
    const key = cur.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags.set(key, true);
    } else {
      flags.set(key, next);
      i++;
    }
  }

  const name = flags.get("name");
  const trainerEmail = flags.get("trainer-email");

  if (typeof name !== "string" || !name.trim()) {
    throw new Error("--name <Vereinsname> ist required");
  }
  if (typeof trainerEmail !== "string" || !trainerEmail.includes("@")) {
    throw new Error("--trainer-email <email> ist required und muss valide sein");
  }

  const planRaw = flags.get("plan");
  const plan: Args["plan"] =
    planRaw === "pro" || planRaw === "verein" ? planRaw : "basic";

  const cycleRaw = flags.get("cycle");
  const cycle: Args["cycle"] = cycleRaw === "season_end" ? "season_end" : "monthly";

  const trainerNameRaw = flags.get("trainer-name");
  const trainerName =
    typeof trainerNameRaw === "string" ? trainerNameRaw : null;

  return {
    name: name.trim(),
    trainerEmail: trainerEmail.toLowerCase().trim(),
    trainerName,
    plan,
    cycle,
    dryRun: flags.get("dry-run") === true,
    withTestSponsor: flags.get("with-test-sponsor") === true,
    skipCrawler: flags.get("skip-crawler") === true,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function log(line: string): void {
  process.stdout.write(`${line}\n`);
}

function logSection(title: string): void {
  log("");
  log(`━━━ ${title} ━━━`);
}

function slugifyName(name: string): string {
  // Lokale slugify-Variante damit der Skript kein Slugify-Import braucht
  // wenn er im --dry-run --skip-crawler Mode ohne node_modules läuft.
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function randomSlugSuffix(): string {
  return randomBytes(2).toString("hex"); // 4 chars
}

function randomToken(): string {
  return randomBytes(24).toString("base64url");
}

function randomId(): string {
  // Better-Auth-User-IDs sind frei wählbar text, hier nutzen wir cuid-ähnliches Format.
  return randomBytes(16).toString("base64url").replace(/[^a-z0-9]/gi, "").slice(0, 24);
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();

  log("╔════════════════════════════════════════════════════════════╗");
  log("║  KickPact — Real-Club Onboarding                          ║");
  log("╚════════════════════════════════════════════════════════════╝");
  log(`Verein:        ${args.name}`);
  log(`Trainer:       ${args.trainerEmail}${args.trainerName ? ` (${args.trainerName})` : ""}`);
  log(`Plan / Cycle:  ${args.plan} / ${args.cycle}`);
  log(`Dry-Run:       ${args.dryRun ? "JA (keine DB-Writes, keine Mails)" : "NEIN"}`);
  log(`With Sponsor:  ${args.withTestSponsor ? "JA" : "NEIN"}`);
  log(`Skip Crawler:  ${args.skipCrawler ? "JA (kein fussball.de-Lookup)" : "NEIN"}`);

  const baseUrl =
    process.env.BETTER_AUTH_URL ?? "https://app.kickpact.de";
  const slug = `${slugifyName(args.name)}-${randomSlugSuffix()}`;
  const invitationToken = randomToken();
  const userId = randomId();

  // ── Phase 1: Better-Auth-User ──────────────────────────────────────────────
  logSection("Phase 1: Trainer-User");

  let resolvedUserId = userId;
  if (args.dryRun) {
    log(`  [DRY-RUN] würde User anlegen: ${args.trainerEmail} (id=${userId})`);
  } else {
    const { db } = await import("../../lib/db/client");
    const { users } = await import("../../lib/db/schema/auth");
    const { eq } = await import("drizzle-orm");

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, args.trainerEmail))
      .limit(1);

    if (existing) {
      resolvedUserId = existing.id;
      log(`  ↩ User existiert bereits: ${args.trainerEmail} (id=${existing.id})`);
    } else {
      await db.insert(users).values({
        id: userId,
        email: args.trainerEmail,
        name: args.trainerName ?? args.trainerEmail.split("@")[0],
        emailVerified: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      log(`  ✓ User angelegt: ${args.trainerEmail} (id=${userId})`);
    }
  }

  // ── Phase 2: Magic-Link versenden ──────────────────────────────────────────
  logSection("Phase 2: Magic-Link");

  let magicLinkUrl: string | null = null;
  if (args.dryRun) {
    magicLinkUrl = `${baseUrl}/api/auth/magic-link/verify?token=DRY_RUN_TOKEN&email=${encodeURIComponent(args.trainerEmail)}`;
    log(`  [DRY-RUN] Magic-Link (würde verschickt werden):`);
    log(`           ${magicLinkUrl}`);
  } else {
    try {
      const { auth } = await import("../../lib/auth/server");
      // Better-Auth signIn.magicLink versendet automatisch via konfigurierter
      // sendMagicLink-Hook (Resend in unserem Setup). Returnt {data, error}.
      // headers wird benötigt damit better-auth den Origin checken kann.
      const result = await auth.api.signInMagicLink({
        body: {
          email: args.trainerEmail,
          callbackURL: `${baseUrl}/verein/${slug}`,
        },
        headers: new Headers({ "x-forwarded-for": "127.0.0.1" }),
      });
      // Better-Auth gibt {status: true} bei Erfolg zurück. Bei Fehlern wirft
      // der Call (z.B. wenn Resend abrauscht in sendMagicLink-Hook).
      if (result?.status) {
        log(`  ✓ Magic-Link an ${args.trainerEmail} verschickt (gültig 15 Min).`);
      } else {
        log(`  ⚠ Magic-Link API liefert unerwarteten Response: ${JSON.stringify(result)}`);
      }
    } catch (err) {
      log(`  ⚠ Magic-Link-Versand übersprungen: ${err instanceof Error ? err.message : String(err)}`);
      log(`    (Trainer kann sich manuell über /login einloggen.)`);
    }
  }

  // ── Phase 3: Verein auf Fußball.de suchen ──────────────────────────────────
  logSection("Phase 3: Fußball.de-Lookup");

  let vereinId: string | null = null;
  let vereinSlug: string | null = null;
  let vereinOrt: string | null = null;
  let mannschaftTeamId: string | null = null;
  let mannschaftName: string = "1. Mannschaft";
  let mannschaftSlug: string | null = null;
  let mannschaftSaison: string = "2526";

  if (args.skipCrawler) {
    log(`  ↩ --skip-crawler aktiv: Verein wird ohne Fußball.de-Verknüpfung angelegt.`);
  } else if (args.dryRun) {
    log(`  [DRY-RUN] würde searchVereine("${args.name}") aufrufen.`);
    log(`  [DRY-RUN] würde getMannschaften(<vereinId>) aufrufen und 1. Mannschaft wählen.`);
  } else {
    try {
      const { searchVereine, getMannschaften } = await import("../../lib/crawler/fussballde");
      log(`  Suche auf fussball.de: "${args.name}"…`);
      const hits = await searchVereine(args.name);
      log(`  ${hits.length} Hit(s) gefunden.`);

      if (hits.length === 0) {
        log(`  ⚠ Kein Verein gefunden. Fallback: ohne Fußball.de-Verknüpfung anlegen.`);
      } else {
        const hit = hits[0];
        vereinId = hit.vereinId;
        vereinSlug = hit.slug;
        vereinOrt = hit.ort;
        log(`  ✓ Gewählt: ${hit.name} (${hit.ort ?? "?"}) — vereinId=${hit.vereinId}`);

        log(`  Lade Mannschaften…`);
        const mannschaften = await getMannschaften(hit.vereinId, hit.slug, hit.name);
        log(`  ${mannschaften.length} Mannschaft(en) gefunden.`);
        if (mannschaften.length > 0) {
          const team = mannschaften[0];
          mannschaftTeamId = team.teamId;
          mannschaftName = team.name;
          mannschaftSlug = team.slug;
          mannschaftSaison = team.saison;
          log(`  ✓ Default-Team: ${team.name} (saison=${team.saison}, teamId=${team.teamId})`);
        }
      }
    } catch (err) {
      log(`  ⚠ Crawler-Fehler: ${err instanceof Error ? err.message : String(err)}`);
      log(`    Onboarding läuft trotzdem weiter, Verein wird ohne fussballde_verein_id angelegt.`);
    }
  }

  // ── Phase 4: Club + Membership + Subscription + Team-License ───────────────
  logSection("Phase 4: DB-Setup (Club / Membership / Subscription / Team)");

  if (args.dryRun) {
    log(`  [DRY-RUN] würde anlegen:`);
    log(`    clubs(slug=${slug}, name="${args.name}", ort=${vereinOrt ?? "null"}, fussballdeVereinId=${vereinId ?? "null"})`);
    log(`    clubMemberships(userId=${resolvedUserId}, clubId=<new>, role=admin)`);
    log(`    subscriptions(clubId=<new>, status=trialing, billingCycle=${args.cycle}, trialEndsAt=+30d)`);
    log(`    teams(clubId=<new>, name="${mannschaftName}", saison=${mannschaftSaison}, fussballdeTeamId=${mannschaftTeamId ?? "null"})`);
    log(`    teamLicenses(teamId=<new>, plan=${args.plan}, status=trialing)`);
  } else {
    const { db } = await import("../../lib/db/client");
    const { clubs, teams, clubMemberships } = await import("../../lib/db/schema/clubs");
    const { subscriptions, teamLicenses } = await import("../../lib/db/schema/billing");
    const { eq } = await import("drizzle-orm");

    // Idempotenz: wenn fussballde_verein_id schon existiert, abort.
    if (vereinId) {
      const [existingClub] = await db
        .select({ id: clubs.id, slug: clubs.slug })
        .from(clubs)
        .where(eq(clubs.fussballdeVereinId, vereinId))
        .limit(1);
      if (existingClub) {
        log(`  ⚠ Verein ist bereits in KickPact registriert (clubId=${existingClub.id}, slug=${existingClub.slug}).`);
        log(`    Skript bricht ab — bestehender Verein bleibt unverändert.`);
        process.exit(0);
      }
    }

    const { TRIAL_DAYS } = await import("../../lib/stripe/pricing");
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

    await db.transaction(async (tx) => {
      const [club] = await tx
        .insert(clubs)
        .values({
          slug,
          name: args.name,
          ort: vereinOrt,
          fussballdeVereinId: vereinId,
        })
        .returning({ id: clubs.id, slug: clubs.slug });
      log(`  ✓ Club angelegt: ${club.slug} (id=${club.id})`);

      await tx.insert(clubMemberships).values({
        userId: resolvedUserId,
        clubId: club.id,
        role: "admin",
      });
      log(`  ✓ Trainer als admin verlinkt.`);

      await tx.insert(subscriptions).values({
        clubId: club.id,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        status: "trialing",
        billingCycle: args.cycle,
        trialEndsAt: trialEnd,
      });
      log(`  ✓ Subscription angelegt (status=trialing bis ${trialEnd.toISOString().slice(0, 10)}).`);

      const [team] = await tx
        .insert(teams)
        .values({
          clubId: club.id,
          name: mannschaftName,
          saison: mannschaftSaison,
          fussballdeTeamId: mannschaftTeamId,
          fussballdeSlug: mannschaftSlug,
          isActive: true,
          discoverable: false,
        })
        .returning({ id: teams.id, name: teams.name });
      log(`  ✓ Default-Team angelegt: ${team.name} (id=${team.id})`);

      await tx.insert(teamLicenses).values({
        subscriptionClubId: club.id,
        teamId: team.id,
        plan: args.plan,
        stripeSubscriptionItemId: null,
        status: "trialing",
      });
      log(`  ✓ TeamLicense angelegt (plan=${args.plan}, status=trialing).`);

      // Stash team-id für Invitation in Phase 5
      (global as unknown as { __defaultTeamId?: string }).__defaultTeamId = team.id;
      (global as unknown as { __clubSlug?: string }).__clubSlug = club.slug;
    });
  }

  // ── Phase 5: Sponsor-Einladung ─────────────────────────────────────────────
  logSection("Phase 5: Sponsor-Einladungslink");

  if (args.dryRun) {
    log(`  [DRY-RUN] würde sponsor_invitations-Row anlegen (teamId=<new>, token=${invitationToken}).`);
  } else {
    const { createInvitation } = await import("../../lib/db/queries/invitations");
    const teamId = (global as unknown as { __defaultTeamId?: string }).__defaultTeamId;
    if (!teamId) {
      throw new Error("Default-Team-ID nicht gesetzt — Phase 4 muss vor Phase 5 laufen.");
    }
    const inv = await createInvitation({
      teamId,
      createdByUserId: resolvedUserId,
    });
    log(`  ✓ Einladung erstellt (token=${inv.token.slice(0, 12)}…, gültig 30 Tage).`);
    // overwrite the random token from above for the final summary
    (global as unknown as { __invitationToken?: string }).__invitationToken = inv.token;
  }

  // ── Phase 6 (optional): Test-Sponsor + Beispiel-Pledge ─────────────────────
  if (args.withTestSponsor) {
    logSection("Phase 6: Test-Sponsor + Beispiel-Pledge");

    const testSponsorEmail = `test-sponsor-${slug.slice(0, 12)}@kickpact-beta.test`;
    const testSponsorName = "Test-Sponsor (Beta-QA)";

    if (args.dryRun) {
      log(`  [DRY-RUN] würde Test-Sponsor anlegen: ${testSponsorEmail} (Familie)`);
      log(`  [DRY-RUN] würde Pledge anlegen: 5€ / Tor, Cap 50€/Monat`);
    } else {
      const { db } = await import("../../lib/db/client");
      const { users } = await import("../../lib/db/schema/auth");
      const { sponsors } = await import("../../lib/db/schema/sponsors");
      const { pledges, pledgeRules } = await import("../../lib/db/schema/pledges");

      const teamId = (global as unknown as { __defaultTeamId?: string }).__defaultTeamId;
      if (!teamId) {
        throw new Error("Default-Team-ID nicht gesetzt.");
      }

      const sponsorUserId = randomId();
      await db.insert(users).values({
        id: sponsorUserId,
        email: testSponsorEmail,
        name: testSponsorName,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      log(`  ✓ Test-User angelegt: ${testSponsorEmail}`);

      const [sponsor] = await db
        .insert(sponsors)
        .values({
          userId: sponsorUserId,
          displayName: testSponsorName,
          type: "familie",
        })
        .returning({ id: sponsors.id });
      log(`  ✓ Sponsor-Profil angelegt (id=${sponsor.id}).`);

      const startsAt = new Date();
      const endsAt = new Date();
      endsAt.setMonth(endsAt.getMonth() + 12);

      const [pledge] = await db
        .insert(pledges)
        .values({
          sponsorId: sponsor.id,
          teamId,
          status: "active",
          startsAt,
          endsAt,
          monthlyCapCents: 5000, // 50€/Monat
        })
        .returning({ id: pledges.id });
      log(`  ✓ Pledge angelegt (id=${pledge.id}, monthlyCap=50€).`);

      await db.insert(pledgeRules).values({
        pledgeId: pledge.id,
        triggerType: "goal_total",
        amountCents: 500, // 5€ pro Tor
        triggerParamsJson: {},
      });
      log(`  ✓ PledgeRule: 5€ pro Tor (goal_total).`);
    }
  }

  // ── Final-Summary ──────────────────────────────────────────────────────────
  log("");
  log("╔════════════════════════════════════════════════════════════╗");
  log("║  ✅ Onboarding abgeschlossen                              ║");
  log("╚════════════════════════════════════════════════════════════╝");

  const finalToken =
    (global as unknown as { __invitationToken?: string }).__invitationToken ??
    invitationToken;

  log(`✅ Verein "${args.name}" ${args.dryRun ? "(SIMULIERT)" : "angelegt"}.`);
  log(`   Slug:                ${slug}`);
  log(`   Trainer-Login:       ${baseUrl}/verein/${slug}`);
  log(`   Sponsor-Einladung:   ${baseUrl}/einladung/${finalToken}`);
  if (magicLinkUrl) {
    log(`   Magic-Link (Dev):    ${magicLinkUrl}`);
  }
  log("");
  log(`📋 Nächste Schritte:`);
  log(`   1. Sponsor-Link an die ersten 5–10 Sponsoren weiterleiten.`);
  log(`   2. Trainer loggt sich via Magic-Link ein, prüft Default-Team.`);
  log(`   3. Falls Plan=basic & echte Zahlung: /verein/${slug}/abo → Checkout.`);
  log("");

  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`\n❌ Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  if (err instanceof Error && err.stack) {
    process.stderr.write(`${err.stack}\n`);
  }
  process.exit(1);
});
