import { db } from "@/lib/db/client";

/**
 * Wipes ALL business data. Use ONLY in integration tests.
 * Order respects FK constraints.
 */
export async function resetTestDb() {
  // SAFETY-GUARD: resetTestDb löscht ALLE Geschäftsdaten. Der `db`-Client nutzt
  // unter Vitest `DATABASE_URL_TEST` (siehe lib/db/client.ts resolveDbUrl) —
  // ABER nur wenn gesetzt; sonst fällt er auf die geteilte Neon-Staging-DB
  // zurück und ein Testlauf würde Staging wipen (genau das ist 2026-05-28
  // passiert). Dieser Guard verweigert den Reset, wenn keine isolierte Test-DB
  // konfiguriert ist oder versehentlich auf Neon zeigt.
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) {
    throw new Error(
      "resetTestDb verweigert: DATABASE_URL_TEST ist nicht gesetzt. Tests würden " +
        "sonst die geteilte Neon-DB löschen. Starte `docker compose -f " +
        "docker-compose.test.yml up -d` und setze DATABASE_URL_TEST in .env.local."
    );
  }
  if (/neon\.tech/i.test(testUrl)) {
    throw new Error(
      "resetTestDb verweigert: DATABASE_URL_TEST zeigt auf eine Neon-DB. Die " +
        "Test-DB muss isoliert sein (z.B. lokale docker-compose.test.yml), nie Neon."
    );
  }

  // EIN atomares TRUNCATE statt 34 sequentieller DELETEs (Flake-Fix 2026-07-06):
  // Die alte Delete-Kette (matches → … → teams → clubs → users) lief bei einem
  // Test-Timeout als Zombie-Promise weiter, WÄHREND die nächste Datei schon
  // seedete — deren frische teams-Rows wurden dann mitten im Seed weggeräumt
  // („Key (team_id)=… is not present"). Ein einzelnes Statement ist atomar:
  // es gibt kein Interleave-Fenster zwischen den Tabellen mehr. CASCADE räumt
  // abhängige Tabellen (sessions/accounts via users-FK etc.) mit ab —
  // identisches Muster wie resetTestDb() in tests/setup/integration-db.ts.
  await db.execute(/* sql */ `
    TRUNCATE
      sent_notifications,
      processed_stripe_events,
      invoice_counters,
      invoice_items,
      invoices,
      event_approvals,
      charges,
      match_events,
      matches,
      pledge_rules,
      pledges,
      sponsor_inquiries,
      sponsor_leads,
      sponsor_invitations,
      sponsor_billing_cycle_history,
      sponsors,
      team_license_transfer_requests,
      team_licenses,
      subscriptions,
      players,
      season_results,
      team_verifications,
      team_memberships,
      club_verifications,
      club_membership_requests,
      club_memberships,
      support_ticket_replies,
      support_tickets,
      teams,
      clubs,
      operator_audit_log,
      users,
      seasons
    RESTART IDENTITY CASCADE;
  `);
}
