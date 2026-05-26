import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  clubMemberships,
  clubMembershipRequests,
  clubVerifications,
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
  processedStripeEvents
} from "@/lib/db/schema";

/**
 * Wipes ALL business data. Use ONLY in integration tests.
 * Order respects FK constraints.
 */
export async function resetTestDb() {
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
  await db.delete(teamMemberships);
  await db.delete(clubVerifications);
  await db.delete(clubMembershipRequests);
  await db.delete(clubMemberships);
  await db.delete(teams);
  await db.delete(clubs);
  await db.delete(users);
  await db.delete(seasons);
}
