/**
 * Löscht ALLE Daten aus der Datenbank (Staging-Reset).
 * Läuft gegen DATABASE_URL aus .env.local.
 *
 * Ausführen:
 *   npx tsx --env-file .env.local scripts/reset-db.mts
 */
import { db } from '../lib/db/client.ts';
import { sql } from 'drizzle-orm';

console.log('Starte komplettes DB-Reset…\n');

// Alle Tabellen auf einmal mit CASCADE — FK-Reihenfolge egal
const tables = [
  'charges',
  'invoice_items',
  'invoices',
  'invoice_counters',
  'pledge_rules',
  'pledges',
  'team_licenses',
  'subscriptions',
  'sponsor_invitations',
  'sponsor_inquiries',
  'sponsors',
  'event_approvals',
  'match_events',
  'matches',
  'players',
  'team_memberships',
  'club_membership_requests',
  'club_memberships',
  'club_verifications',
  'team_verifications',
  'teams',
  'clubs',
  'season_results',
  'seasons',
  'sent_notifications',
  'processed_stripe_events',
  'accounts',
  'sessions',
  'verifications',
  'users',
];

// Einzel-Truncates mit RESTART IDENTITY CASCADE
for (const table of tables) {
  try {
    await db.execute(sql.raw(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`));
    console.log(`✓ ${table}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('does not exist')) {
      console.log(`  skip (nicht vorhanden): ${table}`);
    } else {
      console.error(`✗ ${table}: ${msg}`);
    }
  }
}

console.log('\n✅  DB komplett geleert.');
process.exit(0);
