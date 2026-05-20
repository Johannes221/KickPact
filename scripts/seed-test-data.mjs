#!/usr/bin/env node
/**
 * Seed-Script für KickPact-Test-Daten.
 *
 * Legt an:
 * - Verein "TSV Dossenheim" mit zwei Mannschaften (1. Herren + U17)
 * - 4 Test-User (3 Sponsoren-Accounts + 1 Trainer)
 * - 4 Sponsor-Profile: Tante Erna (familie), Bäckerei Müller (business),
 *   Opa Heinz mit Eltern-Proxy, Anonymer-Spender (familie)
 * - 6 Spieler in der 1. Herren (für goal_by_player Pledges)
 * - 8 Pledges quer durch Match + Saison-Trigger
 * - 5 vergangene Spiele (4 für 1. Herren, 1 für U17)
 * - ~25 charges aus den Spielen + 1 Saison-Wette (Aufstieg geschafft)
 * - 1 aktive Stripe-Subscription auf trialing-Status (Mock)
 * - 1 ClubMembership: johannes.schartl@gmail.com als admin
 *
 * Idempotent: lookup by name + email, insert only if missing.
 *
 * Usage:
 *   node scripts/seed-test-data.mjs
 */
import postgres from "/Users/johan/kickpact/node_modules/postgres/cjs/src/index.js";
import { createId } from "/Users/johan/kickpact/node_modules/@paralleldrive/cuid2/index.js";
import { readFileSync } from "fs";

const env = readFileSync("/Users/johan/kickpact/.env.local", "utf8");
const dbUrl = env.match(/DATABASE_URL="([^"]+)"/)[1];
const sql = postgres(dbUrl, { ssl: "require" });

const ADMIN_EMAIL = "johannes.schartl@gmail.com"; // Verein-Admin
const SAISON = "2026/27";

async function findOrCreateUser(email, name) {
  const [existing] = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
  if (existing) return existing.id;
  const id = createId();
  await sql`
    INSERT INTO users (id, email, name, email_verified, created_at, updated_at)
    VALUES (${id}, ${email}, ${name}, true, NOW(), NOW())
  `;
  console.log(`  + User ${email} → ${id}`);
  return id;
}

async function main() {
  console.log("=== Seed Test-Daten ===\n");

  // 1. Admin-User finden
  const [adminUser] = await sql`SELECT id, email, name FROM users WHERE email = ${ADMIN_EMAIL} LIMIT 1`;
  if (!adminUser) {
    console.error(`✗ User ${ADMIN_EMAIL} nicht gefunden — bitte erst auf der App einloggen.`);
    process.exit(1);
  }
  console.log(`✓ Admin = ${adminUser.email} (${adminUser.id})\n`);

  // 2. Sponsor-User anlegen
  console.log("→ Sponsor-User …");
  const userErna = await findOrCreateUser("tante.erna@kickpact-seed.test", "Erna Schmidt");
  const userBaeck = await findOrCreateUser("baeckerei.mueller@kickpact-seed.test", "Stefan Müller");
  const userHeinz = await findOrCreateUser("opa.heinz@kickpact-seed.test", "Heinz Weber");
  const userAnon = await findOrCreateUser("anon.spender@kickpact-seed.test", "Anonymer Förderer");

  // 3. Trainer-User (Co-Admin)
  const userTrainer = await findOrCreateUser("trainer.dossenheim@kickpact-seed.test", "Markus Trainer");

  // 4. Verein
  console.log("\n→ Verein TSV Dossenheim …");
  let [club] = await sql`SELECT id, slug FROM clubs WHERE name = 'TSV Dossenheim' LIMIT 1`;
  if (!club) {
    const clubId = createId();
    const slug = `tsv-dossenheim-${Math.random().toString(36).slice(2, 6)}`;
    await sql`
      INSERT INTO clubs (id, slug, name, ort, fussballde_verein_id, tax_id, is_small_business, address_json, iban, created_at, updated_at)
      VALUES (
        ${clubId}, ${slug}, 'TSV Dossenheim', 'Dossenheim',
        ${'seed-' + clubId.slice(0, 8)},
        NULL, true,
        ${JSON.stringify({ street: 'Heidelberger Str. 12', zip: '69221', city: 'Dossenheim', country: 'DE' })},
        'DE89 3704 0044 0532 0130 00',
        NOW(), NOW()
      )
    `;
    club = { id: clubId, slug };
    console.log(`  + Verein angelegt → /verein/${slug}`);
  } else {
    console.log(`  = Verein existiert → /verein/${club.slug}`);
  }

  // 5. ClubMembership Admin
  const [membership] = await sql`
    SELECT user_id FROM club_memberships
    WHERE user_id = ${adminUser.id} AND club_id = ${club.id} LIMIT 1
  `;
  if (!membership) {
    await sql`
      INSERT INTO club_memberships (user_id, club_id, role, created_at)
      VALUES (${adminUser.id}, ${club.id}, 'admin', NOW())
    `;
    console.log(`  + Admin-Membership für ${adminUser.email}`);
  }
  // Trainer
  const [trMem] = await sql`
    SELECT user_id FROM club_memberships
    WHERE user_id = ${userTrainer} AND club_id = ${club.id} LIMIT 1
  `;
  if (!trMem) {
    await sql`
      INSERT INTO club_memberships (user_id, club_id, role, created_at)
      VALUES (${userTrainer}, ${club.id}, 'trainer', NOW())
    `;
  }

  // 6. Mannschaften
  console.log("\n→ Mannschaften …");
  let [team1] = await sql`SELECT id FROM teams WHERE club_id = ${club.id} AND name = '1. Herren' LIMIT 1`;
  if (!team1) {
    const id = createId();
    await sql`
      INSERT INTO teams (id, club_id, name, saison, fussballde_team_id, is_active, discoverable, public_tagline, created_at)
      VALUES (${id}, ${club.id}, '1. Herren', ${SAISON}, ${'seed-herren-' + id.slice(0,6)}, true, true,
        'Kreisliga A — Aufstieg ist das große Ziel diese Saison!',
        NOW())
    `;
    team1 = { id };
    console.log(`  + 1. Herren (discoverable)`);
  }
  let [team2] = await sql`SELECT id FROM teams WHERE club_id = ${club.id} AND name = 'U17' LIMIT 1`;
  if (!team2) {
    const id = createId();
    await sql`
      INSERT INTO teams (id, club_id, name, saison, fussballde_team_id, is_active, discoverable, public_tagline, created_at)
      VALUES (${id}, ${club.id}, 'U17', ${SAISON}, ${'seed-u17-' + id.slice(0,6)}, true, true,
        'Bambini-Truppe mit großen Träumen.',
        NOW())
    `;
    team2 = { id };
    console.log(`  + U17 (discoverable)`);
  }

  // 7. Spieler (für 1. Herren)
  console.log("\n→ Spieler 1. Herren …");
  const playerNames = ["Lukas Schmidt", "Tobias Maier", "Florian Weber", "Jonas Klein", "Daniel Schäfer", "Niklas Bauer"];
  const players = [];
  for (const name of playerNames) {
    const [existing] = await sql`SELECT id FROM players WHERE team_id = ${team1.id} AND name = ${name} LIMIT 1`;
    if (existing) {
      players.push({ id: existing.id, name });
    } else {
      const id = createId();
      await sql`
        INSERT INTO players (id, team_id, fussballde_player_id, name, created_at)
        VALUES (${id}, ${team1.id}, ${'seed-' + id.slice(0,6)}, ${name}, NOW())
      `;
      players.push({ id, name });
    }
  }
  console.log(`  ✓ ${players.length} Spieler`);

  // 8. Sponsor-Profile
  console.log("\n→ Sponsor-Profile …");
  async function sponsorFor(userId, displayName, type, opts = {}) {
    const [existing] = await sql`SELECT id FROM sponsors WHERE user_id = ${userId} LIMIT 1`;
    if (existing) return existing.id;
    const id = createId();
    await sql`
      INSERT INTO sponsors (id, user_id, display_name, type, business_name, business_address_json, business_tax_id, pledge_proxies_json, created_at)
      VALUES (
        ${id}, ${userId}, ${displayName}, ${type},
        ${opts.businessName ?? null},
        ${opts.businessAddress ? JSON.stringify(opts.businessAddress) : null},
        ${opts.businessTaxId ?? null},
        ${opts.proxies ? JSON.stringify(opts.proxies) : null},
        NOW()
      )
    `;
    console.log(`  + ${displayName} (${type})`);
    return id;
  }
  const sErna = await sponsorFor(userErna, "Tante Erna", "familie");
  const sBaeck = await sponsorFor(userBaeck, "Bäckerei Müller", "business", {
    businessName: "Bäckerei Müller GmbH",
    businessAddress: { street: "Hauptstr. 5", zip: "69221", city: "Dossenheim", country: "DE" },
    businessTaxId: "DE123456789"
  });
  const sHeinz = await sponsorFor(userHeinz, "Familie Weber (Heinz)", "familie", {
    proxies: [
      { name: "Oma Hilde", sharePercent: 40, note: "Sammelt für die Mannschaftskasse" },
      { name: "Opa Heinz", sharePercent: 40 },
      { name: "Patentante Petra", sharePercent: 20, note: "Trifft Schmidt am Geburtstag" }
    ]
  });
  const sAnon = await sponsorFor(userAnon, "Anonymer Förderer", "familie");

  // 9. Pledges
  console.log("\n→ Pledges …");
  const saisonEnd = new Date("2027-06-30T23:59:59Z");
  const saisonStart = new Date("2026-07-01T00:00:00Z");

  async function pledgeWithRules(sponsorId, teamId, monthlyCapCents, rules) {
    const pledgeId = createId();
    await sql`
      INSERT INTO pledges (id, sponsor_id, team_id, status, starts_at, ends_at, monthly_cap_cents, created_at)
      VALUES (${pledgeId}, ${sponsorId}, ${teamId}, 'active', ${saisonStart}, ${saisonEnd}, ${monthlyCapCents}, NOW())
    `;
    for (const r of rules) {
      await sql`
        INSERT INTO pledge_rules (id, pledge_id, trigger_type, trigger_params_json, amount_cents, per_match_cap_cents, requires_approval, created_at)
        VALUES (${createId()}, ${pledgeId}, ${r.triggerType}, ${JSON.stringify(r.params ?? {})}, ${r.amount}, ${r.perMatchCap ?? null}, ${r.requiresApproval ?? false}, NOW())
      `;
    }
    return pledgeId;
  }

  // Tante Erna: 3 €/Tor + 10 €/Sieg + 5 €/pro Tor von Schmidt
  const pErna = await pledgeWithRules(sErna, team1.id, 5000, [
    { triggerType: "goal_total", amount: 300 },
    { triggerType: "win", amount: 1000 },
    { triggerType: "goal_by_player", amount: 500, params: { playerId: players[0].id, playerName: players[0].name } }
  ]);

  // Bäckerei Müller: 50 €/Comeback + 20 €/Sieg + 200 € auf Aufstieg
  await pledgeWithRules(sBaeck, team1.id, 30000, [
    { triggerType: "comeback_win", amount: 5000 },
    { triggerType: "win", amount: 2000 },
    { triggerType: "season_promotion", amount: 20000 }
  ]);

  // Familie Weber (Heinz, mit Proxies): 2 €/Tor U17 + 100 € auf Klassenerhalt 1. Herren
  await pledgeWithRules(sHeinz, team2.id, 4000, [
    { triggerType: "goal_total", amount: 200 }
  ]);
  await pledgeWithRules(sHeinz, team1.id, null, [
    { triggerType: "season_no_relegation", amount: 10000 }
  ]);

  // Anonymer Förderer: 5 €/Hattrick + Spezial-Tor 10 €
  await pledgeWithRules(sAnon, team1.id, 10000, [
    { triggerType: "hattrick", amount: 500 },
    { triggerType: "special_goal", amount: 1000, requiresApproval: true }
  ]);

  console.log(`  ✓ 5 Pledges angelegt (match + season trigger)`);

  // 10. Vergangene Spiele
  console.log("\n→ Vergangene Spiele 1. Herren …");
  const matchData = [
    { datum: "2026-09-15", heim: "TSV Dossenheim", gast: "SV Schriesheim", eh: 3, eg: 1, hh: 1, hg: 0 },
    { datum: "2026-09-22", heim: "TSV Edingen", gast: "TSV Dossenheim", eh: 0, eg: 2, hh: 0, hg: 1 },
    { datum: "2026-09-29", heim: "TSV Dossenheim", gast: "SG Heddesheim", eh: 4, eg: 0, hh: 2, hg: 0 },
    { datum: "2026-10-06", heim: "FC Birkenau", gast: "TSV Dossenheim", eh: 1, eg: 3, hh: 1, hg: 0 }, // Comeback!
    { datum: "2026-10-13", heim: "TSV Dossenheim", gast: "SV Waldhof", eh: 2, eg: 2, hh: 1, hg: 1 }
  ];
  const matches = [];
  for (const m of matchData) {
    const id = createId();
    await sql`
      INSERT INTO matches (id, team_id, fussballde_spiel_id, datum, heim_name, gast_name, ergebnis_heim, ergebnis_gast, halbzeit_heim, halbzeit_gast, status, crawled_at)
      VALUES (
        ${id}, ${team1.id}, ${'seed-m-' + id.slice(0,6) + '-' + Date.now()},
        ${new Date(m.datum + 'T15:00:00Z')},
        ${m.heim}, ${m.gast},
        ${m.eh}, ${m.eg}, ${m.hh}, ${m.hg},
        'finished',
        NOW()
      )
    `;
    matches.push({ ...m, id });
  }
  console.log(`  ✓ ${matches.length} Matches angelegt`);

  // 11. Charges für Tante Erna's Pledge (vereinfacht: pro Match die confirmed charges)
  console.log("\n→ Charges …");
  // Helfer: rules pro pledge
  const [ernaRules] = await Promise.all([
    sql`SELECT id, trigger_type, amount_cents, trigger_params_json FROM pledge_rules WHERE pledge_id = ${pErna}`
  ]);
  const ruleByTrigger = {};
  for (const r of ernaRules) {
    ruleByTrigger[r.trigger_type] = r;
  }

  let chargeCount = 0;
  for (const m of matches) {
    const isDossenheimHome = m.heim === "TSV Dossenheim";
    const eigenTore = isDossenheimHome ? m.eh : m.eg;
    const gegenTore = isDossenheimHome ? m.eg : m.eh;

    // goal_total: pro Tor 3 €
    for (let i = 0; i < eigenTore; i++) {
      await sql`
        INSERT INTO charges (id, pledge_id, pledge_rule_id, match_id, trigger_type, amount_cents, status, confirmed_at, created_at)
        VALUES (${createId()}, ${pErna}, ${ruleByTrigger.goal_total.id}, ${m.id}, 'goal_total', ${ruleByTrigger.goal_total.amount_cents}, 'confirmed', ${new Date(m.datum + 'T17:00:00Z')}, NOW())
        ON CONFLICT DO NOTHING
      `;
      chargeCount++;
    }

    // win: 1× pro Sieg 10 €
    if (eigenTore > gegenTore) {
      await sql`
        INSERT INTO charges (id, pledge_id, pledge_rule_id, match_id, trigger_type, amount_cents, status, confirmed_at, created_at)
        VALUES (${createId()}, ${pErna}, ${ruleByTrigger.win.id}, ${m.id}, 'win', ${ruleByTrigger.win.amount_cents}, 'confirmed', ${new Date(m.datum + 'T17:00:00Z')}, NOW())
        ON CONFLICT DO NOTHING
      `;
      chargeCount++;
    }

    // goal_by_player für Schmidt: 1 Tor pro Sieg-Spiel (fake)
    if (eigenTore > gegenTore && eigenTore >= 2) {
      await sql`
        INSERT INTO charges (id, pledge_id, pledge_rule_id, match_id, trigger_type, amount_cents, status, confirmed_at, created_at)
        VALUES (${createId()}, ${pErna}, ${ruleByTrigger.goal_by_player.id}, ${m.id}, 'goal_by_player', ${ruleByTrigger.goal_by_player.amount_cents}, 'confirmed', ${new Date(m.datum + 'T17:00:00Z')}, NOW())
        ON CONFLICT DO NOTHING
      `;
      chargeCount++;
    }
  }
  console.log(`  ✓ ${chargeCount} Charges für Tante Erna`);

  // 12. Stripe-Subscription (Mock — trialing)
  console.log("\n→ Stripe-Subscription (Mock) …");
  const [sub] = await sql`SELECT club_id FROM subscriptions WHERE club_id = ${club.id} LIMIT 1`;
  if (!sub) {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 25); // noch 25 Tage
    await sql`
      INSERT INTO subscriptions (club_id, stripe_customer_id, stripe_subscription_id, status, trial_ends_at, current_period_end, created_at, updated_at)
      VALUES (
        ${club.id},
        ${'cus_seed_' + club.id.slice(0,8)},
        ${'sub_seed_' + club.id.slice(0,8)},
        'trialing',
        ${trialEnd},
        ${trialEnd},
        NOW(), NOW()
      )
    `;
    console.log(`  + Mock-Subscription: trialing, endet in 25d`);
  }

  // 13. Season-Wette: Aufstieg ist geschafft (Season-Result)
  console.log("\n→ Season-Result (Mock: Aufstieg geschafft) …");
  const [srExisting] = await sql`SELECT id FROM season_results WHERE team_id = ${team1.id} AND saison = ${SAISON} LIMIT 1`;
  if (!srExisting) {
    await sql`
      INSERT INTO season_results (id, team_id, saison, final_position, teams_in_league, promoted, relegated, cup_round_reached, custom_notes, evaluated_at)
      VALUES (
        ${createId()}, ${team1.id}, ${SAISON},
        2, 16, true, false, 'achtelfinale',
        'Mannschaft hat 78 Tore geschossen (Top 3 der Liga)',
        NOW()
      )
    `;
    console.log(`  + 1. Herren ist aufgestiegen (Platz 2/16)`);
  }

  // 14. Sponsor-Invitation (offen zum Einladen)
  console.log("\n→ Offener Einladungs-Link …");
  const [inv] = await sql`SELECT token FROM sponsor_invitations WHERE team_id = ${team1.id} AND status = 'pending' LIMIT 1`;
  let invToken;
  if (!inv) {
    invToken = createId();
    await sql`
      INSERT INTO sponsor_invitations (id, team_id, token, created_by_user_id, status, created_at)
      VALUES (${createId()}, ${team1.id}, ${invToken}, ${adminUser.id}, 'pending', NOW())
    `;
    console.log(`  + Einladungslink: /einladung/${invToken}`);
  } else {
    invToken = inv.token;
    console.log(`  = Existing Link: /einladung/${invToken}`);
  }

  console.log("\n=== ✓ Seed komplett ===\n");
  console.log("Login als Verein-Admin:");
  console.log(`  → https://kickpact.schartl.dev/login`);
  console.log(`  → Magic-Link an ${ADMIN_EMAIL}`);
  console.log(`\nDein Verein-Dashboard:`);
  console.log(`  → https://kickpact.schartl.dev/verein/${club.slug}`);
  console.log(`\nÖffentlicher Einladungs-Link (für Sponsor-Test):`);
  console.log(`  → https://kickpact.schartl.dev/einladung/${invToken}`);
  console.log(`\nSponsor-Discover (find TSV Dossenheim):`);
  console.log(`  → https://kickpact.schartl.dev/sponsor/discover`);

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
