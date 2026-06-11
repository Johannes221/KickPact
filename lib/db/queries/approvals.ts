import { and, eq, count, desc, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  eventApprovals,
  matchEvents,
  matches,
  teams,
  clubs,
  pledgeRules,
  pledges,
  sponsors,
  charges
} from "@/lib/db/schema";

export interface PendingApprovalRow {
  approvalId: string;
  matchEventId: string;
  pledgeRuleId: string;
  pledgeId: string;
  expiresAt: Date;
  createdAt: Date;
  // Match-Kontext
  matchId: string;
  matchDatum: Date;
  heimName: string;
  gastName: string;
  ergebnisHeim: number | null;
  ergebnisGast: number | null;
  // Team-Kontext
  teamName: string;
  clubName: string;
  clubSlug: string;
  // Event-Kontext
  minute: number | null;
  eventType: "tor" | "auswechslung" | "spezial" | "karte";
  eventSubtype: string | null;
  playerName: string | null;
  // Trigger + Betrag
  triggerType: string;
  amountCents: number;
}

export async function listPendingForSponsor(userId: string): Promise<PendingApprovalRow[]> {
  const rows = await db
    .select({
      approvalId: eventApprovals.id,
      matchEventId: eventApprovals.matchEventId,
      pledgeRuleId: eventApprovals.pledgeRuleId,
      pledgeId: pledges.id,
      expiresAt: eventApprovals.expiresAt,
      createdAt: eventApprovals.createdAt,
      matchId: matches.id,
      matchDatum: matches.datum,
      heimName: matches.heimName,
      gastName: matches.gastName,
      ergebnisHeim: matches.ergebnisHeim,
      ergebnisGast: matches.ergebnisGast,
      teamName: teams.name,
      clubName: clubs.name,
      clubSlug: clubs.slug,
      minute: matchEvents.minute,
      eventType: matchEvents.type,
      eventSubtype: matchEvents.subtype,
      playerName: matchEvents.playerName,
      triggerType: pledgeRules.triggerType,
      amountCents: pledgeRules.amountCents
    })
    .from(eventApprovals)
    .innerJoin(matchEvents, eq(eventApprovals.matchEventId, matchEvents.id))
    .innerJoin(matches, eq(matchEvents.matchId, matches.id))
    .innerJoin(teams, eq(matches.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .innerJoin(pledgeRules, eq(eventApprovals.pledgeRuleId, pledgeRules.id))
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .where(and(eq(eventApprovals.status, "pending"), eq(sponsors.userId, userId)))
    .orderBy(desc(eventApprovals.createdAt));
  return rows;
}

export async function countPendingForSponsor(userId: string): Promise<number> {
  const [row] = await db
    .select({ c: count() })
    .from(eventApprovals)
    .innerJoin(pledgeRules, eq(eventApprovals.pledgeRuleId, pledgeRules.id))
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .where(and(eq(eventApprovals.status, "pending"), eq(sponsors.userId, userId)));
  const approvals = row?.c ?? 0;
  // C2 (Audit 2026-06-11): direkte Charges (Saison/Outcome ohne Event) zählen
  // im „Nächste Schritte"-Badge mit — sonst übersieht der Sponsor sie 21 Tage
  // lang bis zum Auto-Expiry.
  const direct = await db
    .select({ c: count() })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .where(
      and(
        eq(charges.status, "pending_approval"),
        isNull(charges.matchEventId),
        eq(sponsors.userId, userId)
      )
    );
  return approvals + (direct[0]?.c ?? 0);
}

/**
 * C2/C3 (Audit 2026-06-11): pending Charges OHNE matchEvent — Saison-Charges
 * (season_custom) + Outcome-Charges mit manueller Tor-Evidenz (hattrick/
 * comeback_win). Bestätigung läuft direkt auf der Charge
 * (lib/actions/season-charges.ts); diese Liste speist die Sponsor-Inbox.
 */
export interface PendingDirectChargeRow {
  chargeId: string;
  triggerType: string;
  amountCents: number;
  saison: string | null;
  createdAt: Date;
  teamName: string;
  clubName: string;
  matchDatum: Date | null;
  heimName: string | null;
  gastName: string | null;
  ergebnisHeim: number | null;
  ergebnisGast: number | null;
}

export async function listPendingDirectChargesForSponsor(
  userId: string
): Promise<PendingDirectChargeRow[]> {
  return db
    .select({
      chargeId: charges.id,
      triggerType: charges.triggerType,
      amountCents: charges.amountCents,
      saison: charges.saison,
      createdAt: charges.createdAt,
      teamName: teams.name,
      clubName: clubs.name,
      matchDatum: matches.datum,
      heimName: matches.heimName,
      gastName: matches.gastName,
      ergebnisHeim: matches.ergebnisHeim,
      ergebnisGast: matches.ergebnisGast
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .leftJoin(matches, eq(charges.matchId, matches.id))
    .where(
      and(
        eq(charges.status, "pending_approval"),
        isNull(charges.matchEventId),
        eq(sponsors.userId, userId)
      )
    )
    .orderBy(desc(charges.createdAt));
}

/**
 * Holt ein Approval ohne Tenant-Check (für Token-basierte Flows).
 * Liefert null wenn nicht gefunden.
 */
export async function getApprovalById(approvalId: string) {
  const [row] = await db
    .select({
      approval: eventApprovals,
      pledgeRuleId: pledgeRules.id,
      matchEventId: eventApprovals.matchEventId
    })
    .from(eventApprovals)
    .innerJoin(pledgeRules, eq(eventApprovals.pledgeRuleId, pledgeRules.id))
    .where(eq(eventApprovals.id, approvalId))
    .limit(1);
  return row ?? null;
}

/**
 * Holt ein Approval mit Tenant-Check (gehört dem User?).
 * Liefert null wenn nicht gefunden oder nicht owned.
 */
export async function getApprovalForUpdate(approvalId: string, userId: string) {
  const [row] = await db
    .select({
      approval: eventApprovals,
      sponsorUserId: sponsors.userId,
      pledgeRuleId: pledgeRules.id,
      matchEventId: eventApprovals.matchEventId
    })
    .from(eventApprovals)
    .innerJoin(pledgeRules, eq(eventApprovals.pledgeRuleId, pledgeRules.id))
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .where(eq(eventApprovals.id, approvalId))
    .limit(1);
  if (!row || row.sponsorUserId !== userId) return null;
  return row;
}
