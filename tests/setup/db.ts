import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  clubMemberships,
  clubMembershipRequests,
  clubVerifications,
  teamVerifications,
  teamMemberships,
  teams,
  sponsors,
  sponsorInquiries,
  sponsorInvitations,
  pledges,
  pledgeRules,
  matches,
  matchEvents,
  charges,
  subscriptions,
  teamLicenses,
  invoices,
  invoiceItems,
  invoiceCounters,
  eventApprovals,
  players,
  seasons,
  seasonResults,
  sentNotifications,
  processedStripeEvents,
  operatorAuditLog,
  supportTickets,
  supportTicketReplies
} from "@/lib/db/schema";

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

  // No-FK tables first (safe to delete in any order)
  await db.delete(sentNotifications);
  await db.delete(processedStripeEvents);
  await db.delete(invoiceCounters);

  await db.delete(invoiceItems);
  await db.delete(invoices);
  await db.delete(eventApprovals);
  await db.delete(charges);
  await db.delete(matchEvents);
  await db.delete(matches);
  await db.delete(pledgeRules);
  await db.delete(pledges);
  await db.delete(sponsorInquiries);
  await db.delete(sponsorInvitations);
  await db.delete(sponsors);
  await db.delete(teamLicenses);
  await db.delete(subscriptions);
  await db.delete(players);
  await db.delete(seasonResults);
  await db.delete(teamVerifications);
  await db.delete(teamMemberships);
  await db.delete(clubVerifications);
  await db.delete(clubMembershipRequests);
  await db.delete(clubMemberships);
  await db.delete(supportTicketReplies);
  await db.delete(supportTickets);
  await db.delete(teams);
  await db.delete(clubs);
  // operator_audit_log FK → users ist ON DELETE restrict, muss VOR users weg.
  await db.delete(operatorAuditLog);
  await db.delete(users);
  await db.delete(seasons);
}
