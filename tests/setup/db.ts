import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  clubMemberships,
  teams,
  sponsors,
  pledges,
  pledgeRules,
  matches,
  matchEvents,
  charges,
  subscriptions,
  teamLicenses,
  invoices,
  invoiceItems,
  eventApprovals,
  players
} from "@/lib/db/schema";

/**
 * Wipes ALL business data. Use ONLY in integration tests.
 * Order respects FK constraints.
 */
export async function resetTestDb() {
  await db.delete(invoiceItems);
  await db.delete(invoices);
  await db.delete(eventApprovals);
  await db.delete(charges);
  await db.delete(matchEvents);
  await db.delete(matches);
  await db.delete(pledgeRules);
  await db.delete(pledges);
  await db.delete(sponsors);
  await db.delete(teamLicenses);
  await db.delete(subscriptions);
  await db.delete(players);
  await db.delete(clubMemberships);
  await db.delete(teams);
  await db.delete(clubs);
  await db.delete(users);
}
