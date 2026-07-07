import { and, eq, gte, like, lte, or } from "drizzle-orm";
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
import { isUniqueViolation } from "@/lib/db/errors";

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
 *   - status='active' ODER sommerpause-pausiert (status='paused' +
 *     sommerpausePaused=true)
 *   - endsAt zwischen now und now + daysBeforeEnd
 *
 * Warum auch sommerpause-pausierte Pledges (2026-07-07): der Cron
 * `pause-pledges-sommerpause` setzt am 1.6. ALLE aktiven Pledges auf
 * `paused`. Ein Standard-Pact endet 30.6., die gestaffelte Renewal-Strecke
 * feuert 30/14/3 Tage vorher (31.5./16.6./27.6.). Ohne diese Pledges würde
 * die Strecke am 1.6. abbrechen — nur die 30-Tage-Mail käme an, 14 & 3 nie.
 * Der Sponsor liefe damit un-renewt aus. Sponsor-MANUELL pausierte Pledges
 * (sommerpausePaused=false) bleiben bewusst ausgeschlossen — die will der
 * Sponsor nicht verlängert bekommen. Der 1-Click-Renewal-Link liest die
 * Pledge per ID (status-agnostisch), der Clone entsteht als neue aktive
 * Pledge — funktioniert also auch auf pausierten Pledges.
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
        or(
          eq(pledges.status, "active"),
          and(
            eq(pledges.status, "paused"),
            eq(pledges.sommerpausePaused, true)
          )
        ),
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
 * Ziel-Saison gesendet wurde (Reporting-Helper). Phase 3 / R7: matcht sowohl
 * Bestands-Keys (`<pledgeId>:<saison>`) als auch Stage-Keys
 * (`<pledgeId>:<saison>:<stage>`).
 */
export async function hasRenewalNotificationBeenSent(
  pledgeId: string,
  targetSaison: string
): Promise<boolean> {
  const base = `${pledgeId}:${targetSaison}`;
  const [row] = await db
    .select({ key: sentNotifications.key })
    .from(sentNotifications)
    .where(
      and(
        eq(sentNotifications.kind, "season-renewal"),
        or(
          eq(sentNotifications.key, base),
          like(sentNotifications.key, `${base}:%`)
        )
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
 * Vorgehen (Phase 3 / R3, Architektur „Saison-Bump statt Saison-Rows"):
 *   1. Lade die Original-Pledge und ihre PledgeRules.
 *   2. Ziel-Team über `findNextSeasonTeam`. Liefert das nichts (Pre-Bump-
 *      Klick im Juni — die Row trägt noch die alte Saison), fällt das Ziel
 *      auf die ORIGINAL-Team-Row zurück: sie WIRD nach dem Rollover-Bump
 *      die nächste Saison.
 *   3. `startsAt`/`endsAt` aus Options, sonst: alter endsAt+1 Tag, +1 Jahr.
 *   4. Insert neue Pledge + alle Rules (inkl. capCents/capPeriod) in einer
 *      Transaktion.
 *
 * Idempotenz: als existierender Clone zählt NUR eine Pledge des Sponsors
 * auf dem Ziel-Team mit `endsAt > original.endsAt`. Nach dem Bump ist das
 * Ziel dieselbe Row wie das Original — ein Check auf bloße Existenz würde
 * die ALTE Pledge finden und das Renewal still verschlucken.
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
  try {
    return await runCloneTransaction(pledgeId, nextSaison, options);
  } catch (err) {
    // Review-Auflage 1 (2026-06-12): Zwei parallele Renewal-Requests können
    // beide den SELECT-Idempotenz-Check passieren; der Unique-Index
    // pledges_cloned_from_unique_idx lässt nur einen Insert durch — der
    // Verlierer liefert den Clone des Gewinners (idempotentes Ergebnis).
    if (isUniqueViolation(err)) {
      const [existing] = await db
        .select({ id: pledges.id, teamId: pledges.teamId })
        .from(pledges)
        .where(eq(pledges.clonedFromPledgeId, pledgeId))
        .limit(1);
      if (existing) {
        const rules = await db
          .select({ id: pledgeRules.id })
          .from(pledgeRules)
          .where(eq(pledgeRules.pledgeId, existing.id));
        return {
          pledgeId: existing.id,
          pledgeRulesCount: rules.length,
          targetTeamId: existing.teamId,
          targetSaison: nextSaison
        };
      }
    }
    throw err;
  }
}

async function runCloneTransaction(
  pledgeId: string,
  nextSaison: string,
  options: { startsAt?: Date; endsAt?: Date }
): Promise<ClonedPledge> {
  return db.transaction(async (tx) => {
    const [original] = await tx
      .select()
      .from(pledges)
      .where(eq(pledges.id, pledgeId))
      .limit(1);
    if (!original) throw new Error("Pledge nicht gefunden.");

    // Ziel-Team: dedizierte Next-Season-Row, sonst Fallback auf die
    // Original-Row (Pre-Bump-Klick — der Saison-Rollover bumpt sie später).
    let targetTeam = await findNextSeasonTeam(original.teamId, nextSaison);
    if (!targetTeam) {
      const [sameRow] = await tx
        .select({ id: teams.id, name: teams.name, saison: teams.saison })
        .from(teams)
        .where(eq(teams.id, original.teamId))
        .limit(1);
      if (!sameRow) {
        throw new Error(
          `Es gibt noch keine Mannschaft für die Saison ${nextSaison}. Bitte kontaktiere den Verein.`
        );
      }
      targetTeam = sameRow;
    }

    const originalEndsAt =
      original.endsAt instanceof Date
        ? original.endsAt
        : new Date(original.endsAt);

    // Idempotenz via Provenance (Review K3 2026-06-11): NUR eine Pledge, die
    // nachweislich aus DIESER Original-Pledge geklont wurde, zählt als Clone.
    // Die alte endsAt-Heuristik matchte bei zwei Pacts desselben Sponsors auf
    // demselben Team (legal!) den Clone von Pact A auch für Pact B — B wurde
    // dann nie verlängert, obwohl die UI "Verlängert!" zeigte.
    const [existingClone] = await tx
      .select({ id: pledges.id })
      .from(pledges)
      .where(eq(pledges.clonedFromPledgeId, original.id))
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
        targetSaison: nextSaison
      };
    }

    // Default-Datumsfenster: ab dem Tag NACH der alten Endung, 1 Jahr lang
    const startsAt =
      options.startsAt ?? new Date(originalEndsAt.getTime() + 24 * 60 * 60 * 1000);
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
        monthlyCapCents: original.monthlyCapCents,
        clonedFromPledgeId: original.id
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
          capCents: r.capCents,
          capPeriod: r.capPeriod,
          requiresApproval: r.requiresApproval
        }))
      );
    }

    return {
      pledgeId: newPledge.id,
      pledgeRulesCount: originalRules.length,
      targetTeamId: targetTeam.id,
      targetSaison: nextSaison
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
