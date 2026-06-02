import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  pledges,
  pledgeRules,
  sponsors,
  teams,
  clubs,
  users,
  sentNotifications
} from "@/lib/db/schema";
import { sponsorLabelSql } from "./sponsor-label";

/**
 * Plan 3 Teil 2 — Saison-Renewal Queries.
 *
 * `findPledgesEligibleForRenewal`: alle aktiven Pledges deren `endsAt` in
 * den nächsten `daysBeforeEnd` Tagen liegt. Dedupe gegen
 * `sent_notifications` (kind=`season-renewal`) findet im Inngest-Job statt
 * via INSERT ON CONFLICT — diese Query liefert nur Kandidaten.
 *
 * `clonePledgeForNextSeason`: legt eine neue Pledge + alle PledgeRules
 * für die Nachfolge-Saison an. Original-Pledge läuft normal aus.
 */

export interface RenewalCandidate {
  pledgeId: string;
  endsAt: Date;
  sponsorId: string;
  teamId: string;
  sponsorDisplayName: string;
  sponsorEmail: string;
  teamName: string;
  teamSaison: string;
  clubName: string;
  clubSlug: string;
  clubId: string;
}

/**
 * Liefert alle Pledges die für eine Renewal-Prompt in Frage kommen:
 *   - status='active'
 *   - endsAt zwischen now und now + daysBeforeEnd
 *
 * Dedupe (eine Mail pro Pledge) ist Aufgabe des Inngest-Jobs via
 * `sent_notifications` Tabelle.
 */
export async function findPledgesEligibleForRenewal(
  now: Date,
  daysBeforeEnd = 30
): Promise<RenewalCandidate[]> {
  const windowEnd = new Date(now.getTime() + daysBeforeEnd * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      pledgeId: pledges.id,
      endsAt: pledges.endsAt,
      sponsorId: pledges.sponsorId,
      teamId: pledges.teamId,
      sponsorDisplayName: sponsorLabelSql,
      sponsorEmail: users.email,
      teamName: teams.name,
      teamSaison: teams.saison,
      clubName: clubs.name,
      clubSlug: clubs.slug,
      clubId: clubs.id
    })
    .from(pledges)
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .innerJoin(users, eq(sponsors.userId, users.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(
      and(
        eq(pledges.status, "active"),
        gte(pledges.endsAt, now),
        lte(pledges.endsAt, windowEnd)
      )
    );
  return rows.map((r): RenewalCandidate => ({
    ...r,
    endsAt: r.endsAt instanceof Date ? r.endsAt : new Date(r.endsAt as unknown as string)
  }));
}

/**
 * Prüft ob für eine Pledge bereits eine Renewal-Mail für eine bestimmte
 * Ziel-Saison gesendet wurde (Dedupe-Helper für Inngest-Tests + den Job).
 */
export async function hasRenewalNotificationBeenSent(
  pledgeId: string,
  targetSaison: string
): Promise<boolean> {
  const key = `${pledgeId}:${targetSaison}`;
  const [row] = await db
    .select({ key: sentNotifications.key })
    .from(sentNotifications)
    .where(
      and(
        eq(sentNotifications.kind, "season-renewal"),
        eq(sentNotifications.key, key)
      )
    )
    .limit(1);
  return !!row;
}

/**
 * Sucht oder erstellt das "next saison Team" für ein gegebenes Team.
 * Ziel-Team ist `teams` mit gleichem (clubId, fussballdeTeamId ODER name)
 * und Saison = nextSaison. Wenn kein passendes Team existiert → null
 * zurückgeben; der Caller muss dann den User informieren dass die
 * Mannschaft für die neue Saison noch nicht angelegt ist.
 */
export async function findNextSeasonTeam(
  currentTeamId: string,
  nextSaison: string
): Promise<{ id: string; name: string; saison: string } | null> {
  const [anchor] = await db
    .select({
      clubId: teams.clubId,
      name: teams.name,
      fussballdeTeamId: teams.fussballdeTeamId
    })
    .from(teams)
    .where(eq(teams.id, currentTeamId))
    .limit(1);
  if (!anchor) return null;

  if (anchor.fussballdeTeamId) {
    const [byFussballde] = await db
      .select({ id: teams.id, name: teams.name, saison: teams.saison })
      .from(teams)
      .where(
        and(
          eq(teams.clubId, anchor.clubId),
          eq(teams.fussballdeTeamId, anchor.fussballdeTeamId),
          eq(teams.saison, nextSaison)
        )
      )
      .limit(1);
    if (byFussballde) return byFussballde;
  }

  const [byName] = await db
    .select({ id: teams.id, name: teams.name, saison: teams.saison })
    .from(teams)
    .where(
      and(
        eq(teams.clubId, anchor.clubId),
        eq(teams.name, anchor.name),
        eq(teams.saison, nextSaison)
      )
    )
    .limit(1);
  return byName ?? null;
}

export interface ClonedPledge {
  pledgeId: string;
  pledgeRulesCount: number;
  targetTeamId: string;
  targetSaison: string;
}

/**
 * Kopiert eine Pledge + alle ihre Rules in die nächste Saison.
 *
 * Vorgehen:
 *   1. Lade die Original-Pledge und ihre PledgeRules.
 *   2. Finde das Ziel-Team über `findNextSeasonTeam`. Wenn keins
 *      existiert → throw (Caller fängt und zeigt user-friendly message).
 *   3. Wenn `nextSeasonBoundaries` gegeben → setze `startsAt` + `endsAt`
 *      darauf. Sonst: starte am alten endsAt+1s, ende +1 Jahr.
 *   4. Insert neue Pledge + alle Rules in einer Transaktion.
 *
 * Idempotenz: falls bereits eine Pledge für (sponsorId, teamId,
 * targetSaison) existiert, wird ihre ID zurückgegeben (kein Duplicate).
 */
export async function clonePledgeForNextSeason(
  pledgeId: string,
  nextSaison: string,
  options: {
    /** Startdatum der neuen Pledge. Default: am Tag nach dem alten endsAt. */
    startsAt?: Date;
    /** Enddatum der neuen Pledge. Default: startsAt + 1 Jahr. */
    endsAt?: Date;
  } = {}
): Promise<ClonedPledge> {
  return db.transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(pledges)
      .where(eq(pledges.id, pledgeId))
      .limit(1);
    if (!original) throw new Error("Pledge nicht gefunden.");

    const targetTeam = await findNextSeasonTeam(original.teamId, nextSaison);
    if (!targetTeam) {
      throw new Error(
        `Es gibt noch keine Mannschaft für die Saison ${nextSaison}. Bitte kontaktiere den Verein.`
      );
    }

    // Idempotenz: existiert bereits eine Pledge dieses Sponsors für das Ziel-Team?
    const [existingClone] = await tx
      .select({ id: pledges.id })
      .from(pledges)
      .where(
        and(
          eq(pledges.sponsorId, original.sponsorId),
          eq(pledges.teamId, targetTeam.id)
        )
      )
      .limit(1);
    if (existingClone) {
      // Count rules for return-value
      const rules = await tx
        .select({ id: pledgeRules.id })
        .from(pledgeRules)
        .where(eq(pledgeRules.pledgeId, existingClone.id));
      return {
        pledgeId: existingClone.id,
        pledgeRulesCount: rules.length,
        targetTeamId: targetTeam.id,
        targetSaison: targetTeam.saison
      };
    }

    // Default-Datumsfenster: ab dem Tag NACH der alten Endung, 1 Jahr lang
    const startsAt =
      options.startsAt ??
      new Date(
        (original.endsAt instanceof Date
          ? original.endsAt
          : new Date(original.endsAt)
        ).getTime() +
          24 * 60 * 60 * 1000
      );
    const endsAt =
      options.endsAt ??
      new Date(startsAt.getTime() + 365 * 24 * 60 * 60 * 1000);

    const [newPledge] = await tx
      .insert(pledges)
      .values({
        sponsorId: original.sponsorId,
        teamId: targetTeam.id,
        status: "active",
        startsAt,
        endsAt,
        monthlyCapCents: original.monthlyCapCents
      })
      .returning({ id: pledges.id });

    if (!newPledge) throw new Error("Pledge-Insert fehlgeschlagen.");

    const originalRules = await tx
      .select()
      .from(pledgeRules)
      .where(eq(pledgeRules.pledgeId, pledgeId));

    if (originalRules.length > 0) {
      await tx.insert(pledgeRules).values(
        originalRules.map((r) => ({
          pledgeId: newPledge.id,
          triggerType: r.triggerType,
          triggerParamsJson: r.triggerParamsJson,
          amountCents: r.amountCents,
          perMatchCapCents: r.perMatchCapCents,
          requiresApproval: r.requiresApproval
        }))
      );
    }

    return {
      pledgeId: newPledge.id,
      pledgeRulesCount: originalRules.length,
      targetTeamId: targetTeam.id,
      targetSaison: targetTeam.saison
    };
  });
}

/**
 * Liefert alle aktiven Pledges deren Renewal-Notification für die
 * gegebene Ziel-Saison noch NICHT geschickt wurde. Nützlich für
 * Admin-Dashboards / Reporting (der Inngest-Job nutzt eher die
 * Eligible-Liste + INSERT-ON-CONFLICT als atomares Gate).
 */
export async function findEligiblePledgesNotYetNotified(
  now: Date,
  targetSaison: string,
  daysBeforeEnd = 30
): Promise<RenewalCandidate[]> {
  const candidates = await findPledgesEligibleForRenewal(now, daysBeforeEnd);
  if (candidates.length === 0) return [];

  const result: RenewalCandidate[] = [];
  for (const c of candidates) {
    const wasSent = await hasRenewalNotificationBeenSent(c.pledgeId, targetSaison);
    if (!wasSent) result.push(c);
  }
  return result;
}
