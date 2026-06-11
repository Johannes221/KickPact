"use server";

import { eq, and, inArray, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { isUniqueViolation } from "@/lib/db/errors";
import {
  matches,
  matchEvents,
  teams,
  clubs,
  charges,
  eventApprovals,
  pledges
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { assertClubWriteAccess } from "@/lib/auth/scope";
import {
  evaluateTriggers,
  type MatchInput,
  type MatchEventInput
} from "@/lib/crawler/triggers";
import { detectTeamSide } from "@/lib/crawler/team-side";
import {
  loadActivePledgeRulesForTeam,
  getMonthlyChargedCents
} from "@/lib/db/queries/evaluation";

const inputSchema = z.object({
  matchId: z.string().min(1),
  minute: z.number().int().min(0).max(130),
  type: z.enum(["tor", "auswechslung", "spezial", "karte"]),
  subtype: z.string().optional(),
  side: z.enum(["heim", "gast"]),
  playerName: z.string().min(1).optional(),
  playerId: z.string().optional()
});

export type AddManualEventInput = z.infer<typeof inputSchema>;

export async function addManualEvent(input: AddManualEventInput) {
  const user = await requireUser();
  const parsed = inputSchema.parse(input);

  // Match → Team → Club lookup für Tenant-Check
  const [target] = await db
    .select({ team: teams, club: clubs, match: matches })
    .from(matches)
    .innerJoin(teams, eq(matches.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(matches.id, parsed.matchId))
    .limit(1);
  if (!target) throw new Error("Match nicht gefunden");

  // Permission: mindestens trainer + Subscription darf nicht read-only sein
  await assertClubWriteAccess(target.club.slug, "trainer");

  // Bestimme teamSide via detectTeamSide-Helper — identisch zur Crawler-Pipeline,
  // damit Manual-Events nicht anders klassifiziert werden als Scraped-Events.
  // Audit 2026-05-24 Phase 2 Task 2.7: vorher split(" ")[0] → bei
  // "Herren - FC Sportfreunde 1910 Dossenheim 3" greift first word "herren"
  // nicht im heimName → teamSide=gast → Manual-Events feuern für falsche Seite.
  const teamSide = detectTeamSide(
    [target.team.name, target.club.name],
    target.match.heimName
  );

  // Falls Trainer ein Event auf der "anderen Seite" einträgt (also nicht teamSide):
  // wir erlauben es trotzdem in DB, evaluieren aber NUR wenn side === teamSide
  // (sonst keine Charges für dieses Event, weil pledges nur für eigene Mannschaft zählen).

  // SECURITY (H3): Scoreline-Reconciliation. Bei einem bereits gescrapten
  // (finished) Spiel ist der offizielle Spielstand die Wahrheit. Ein manuelles
  // "tor" auf der eigenen Seite darf die Anzahl der eigenen Tor-Events NICHT
  // über das offizielle Eigen-Ergebnis treiben — sonst könnte ein Verein
  // Phantom-Tore über den Endstand hinaus eintragen. Spieler-Zuordnung bis zur
  // offiziellen Toranzahl bleibt erlaubt (Scraper verpasst manchmal Torschützen).
  if (
    target.match.status === "finished" &&
    parsed.type === "tor" &&
    parsed.side === teamSide
  ) {
    const ownScore =
      (teamSide === "heim"
        ? target.match.ergebnisHeim
        : target.match.ergebnisGast) ?? 0;
    const [{ count } = { count: 0 }] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(matchEvents)
      .where(
        and(
          eq(matchEvents.matchId, parsed.matchId),
          eq(matchEvents.type, "tor"),
          eq(matchEvents.side, parsed.side)
        )
      );
    if (count >= ownScore) {
      throw new Error(
        `Manuelles Tor abgelehnt: Es sind bereits ${count} Tore für die eigene ` +
          `Mannschaft erfasst, der offizielle Spielstand weist ${ownScore} aus. ` +
          `Bitte zuerst das Ergebnis korrigieren lassen.`
      );
    }
  }

  const result = await db.transaction(async (tx) => {
    // Insert match_event
    const [created] = await tx
      .insert(matchEvents)
      .values({
        matchId: parsed.matchId,
        minute: parsed.minute,
        type: parsed.type,
        subtype: parsed.subtype ?? null,
        side: parsed.side,
        playerName: parsed.playerName ?? null,
        playerId: parsed.playerId ?? null,
        source: "manual",
        reportedByUserId: user.id
      })
      .returning();

    if (!created) throw new Error("Insert match_event fehlgeschlagen");

    // Wenn Event nicht für eigene Mannschaft: keine Trigger-Eval
    if (parsed.side !== teamSide) {
      return { eventId: created.id, charges: 0, approvals: 0 };
    }

    // Audit 2026-06-11 / B7: Manuelle Tore auf NICHT-beendeten Spielen
    // (scheduled/live/postponed) erzeugen keine Sofort-Proposals — es gibt
    // noch keinen offiziellen Endstand als Gegenprobe (H3 greift erst bei
    // finished). Das Event bleibt gespeichert; die Charges entstehen beim
    // finished-Übergang über evaluate-match.
    if (parsed.type === "tor" && target.match.status !== "finished") {
      return { eventId: created.id, charges: 0, approvals: 0 };
    }

    // Trigger-Engine inline für dieses einzelne Event
    // Wir bauen einen MatchInput mit NUR diesem Event, damit nur Rules dafür feuern
    const matchDate = target.match.datum instanceof Date
      ? target.match.datum
      : new Date(target.match.datum);

    const rules = await loadActivePledgeRulesForTeam(target.team.id, matchDate);

    const singleEventInput: MatchInput = {
      id: target.match.id,
      teamSide,
      ergebnisHeim: target.match.ergebnisHeim ?? 0,
      ergebnisGast: target.match.ergebnisGast ?? 0,
      halbzeitHeim: target.match.halbzeitHeim,
      halbzeitGast: target.match.halbzeitGast,
      events: [
        {
          id: created.id,
          type: created.type,
          subtype: created.subtype,
          minute: created.minute,
          side: created.side,
          playerName: created.playerName,
          playerId: created.playerId,
          source: created.source
        } satisfies MatchEventInput
      ]
    };

    const proposals = evaluateTriggers(singleEventInput, rules);

    // Audit 2026-05-25 (Phase 5): Approval-Expiry aus pledges.endsAt ableiten +
    // pessimistic FOR UPDATE Lock auf jeden Pledge gegen Monthly-Cap-Races
    // (parallel zu evaluate-match.ts B-1-Fix). Sortierte IDs gegen Deadlocks
    // wenn mehrere Pledges im selben Trainer-Event-Request gelockt werden.
    const uniquePledgeIds = [...new Set(proposals.map((p) => p.pledgeId))].sort();
    const pledgeInfoMap = new Map<string, { endsAt: Date; cap: number | null }>();
    if (uniquePledgeIds.length > 0) {
      const pledgeRows = await tx
        .select({
          id: pledges.id,
          endsAt: pledges.endsAt,
          cap: pledges.monthlyCapCents
        })
        .from(pledges)
        .where(inArray(pledges.id, uniquePledgeIds))
        .for("update");
      for (const row of pledgeRows) {
        pledgeInfoMap.set(row.id, { endsAt: row.endsAt, cap: row.cap });
      }
    }

    let chargeCount = 0;
    let approvalCount = 0;

    for (const p of proposals) {
      // Only consider proposals with matchEventId pointing to OUR new event
      if (p.matchEventId !== created.id) continue;

      // Audit 2026-06-11 / B2: results_only-Doppel-Charge. Existieren für
      // (pledgeRuleId, matchId) bereits ANONYME Auto-Charges (matchEventId
      // IS NULL, nicht storniert), hat die Pipeline die Tor-GESAMTMENGE
      // schon aus dem offiziellen Endstand abgerechnet — ein manuell
      // nachgetragener Torschütze würde dasselbe Tor doppelt berechnen.
      // Spieler-bezogene Rules (goal_by_player etc.) feuern weiter: für
      // diese Nachträge sind die manuellen Events da.
      if (p.triggerType === "goal_total" && p.matchId) {
        const [anonCharge] = await tx
          .select({ id: charges.id })
          .from(charges)
          .where(
            and(
              eq(charges.pledgeRuleId, p.pledgeRuleId),
              eq(charges.matchId, p.matchId),
              isNull(charges.matchEventId),
              ne(charges.status, "cancelled")
            )
          )
          .limit(1);
        if (anonCharge) continue;
      }

      // Monthly-cap check unter Lock — siehe pessimistic Select oben.
      // SECURITY (C3): Cap-Fenster über den ABRECHNUNGS-Monat (jetzt), nicht über
      // den Spieltag. Manuelle Charges sind approval-pflichtig (confirmedAt=null,
      // gezählt via createdAt=jetzt) und landen über confirmedAt im aktuellen
      // Rechnungslauf — der Cap muss daher gegen denselben Monat geprüft werden.
      // Vorher: Cap gegen matchDate-Monat → rückdatiertes Event prüfte einen
      // alten Monat mit Cap-Headroom, wurde aber im aktuellen Monat abgerechnet.
      // Audit 2026-06-11 / B5: Summe via tx, damit Inserts aus DIESER
      // Transaktion (mehrere Proposals desselben Events) mitgezählt werden.
      const info = pledgeInfoMap.get(p.pledgeId);
      if (info?.cap !== null && info?.cap !== undefined) {
        const alreadyCharged = await getMonthlyChargedCents(p.pledgeId, new Date(), tx);
        if (alreadyCharged + p.amountCents > info.cap) continue;
      }

      try {
        const [chargeRow] = await tx
          .insert(charges)
          .values({
            pledgeId: p.pledgeId,
            pledgeRuleId: p.pledgeRuleId,
            matchId: p.matchId,
            matchEventId: p.matchEventId,
            triggerType: p.triggerType,
            amountCents: p.amountCents,
            status: p.requiresApproval ? "pending_approval" : "confirmed",
            confirmedAt: p.requiresApproval ? null : new Date()
          })
          .returning();
        chargeCount++;

        if (p.requiresApproval && chargeRow) {
          // Approval expired am Pledge-Ende. Fallback auf 30d wenn endsAt
          // fehlt (sollte nie passieren — pledges.endsAt ist notNull).
          const pledgeEndsAt = pledgeInfoMap.get(p.pledgeId)?.endsAt;
          const approvalExpiresAt =
            pledgeEndsAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          await tx.insert(eventApprovals).values({
            matchEventId: created.id,
            pledgeRuleId: p.pledgeRuleId,
            status: "pending",
            expiresAt: approvalExpiresAt
          });
          approvalCount++;
        }
      } catch (err) {
        // Drizzle wrappt den Postgres-Fehler — Cause-Kette prüfen statt nur
        // die Top-Level-Message ("Failed query: …").
        if (isUniqueViolation(err)) continue;
        throw err;
      }
    }

    return { eventId: created.id, charges: chargeCount, approvals: approvalCount };
  });

  revalidatePath(`/verein/${target.club.slug}/spiel/${parsed.matchId}`);

  return result;
}
