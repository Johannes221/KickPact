"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import {
  matches,
  matchEvents,
  teams,
  clubs,
  charges,
  eventApprovals
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { assertClubAccess } from "@/lib/auth/scope";
import {
  evaluateTriggers,
  type MatchInput,
  type MatchEventInput
} from "@/lib/crawler/triggers";
import {
  loadActivePledgeRulesForTeam,
  getMonthlyChargedCents,
  getPledgeMonthlyCap
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

  // Permission: mindestens trainer
  await assertClubAccess(target.club.slug, "trainer");

  // Bestimme teamSide (welche Seite ist die gesponserte Mannschaft?)
  // Heuristik: first significant word of team name in heim_name → heim
  const teamFirstWord = target.team.name.toLowerCase().split(" ")[0];
  const heimMatch = target.match.heimName.toLowerCase().includes(teamFirstWord);
  const teamSide: "heim" | "gast" = heimMatch ? "heim" : "gast";

  // Falls Trainer ein Event auf der "anderen Seite" einträgt (also nicht teamSide):
  // wir erlauben es trotzdem in DB, evaluieren aber NUR wenn side === teamSide
  // (sonst keine Charges für dieses Event, weil pledges nur für eigene Mannschaft zählen).

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

    let chargeCount = 0;
    let approvalCount = 0;

    for (const p of proposals) {
      // Only consider proposals with matchEventId pointing to OUR new event
      if (p.matchEventId !== created.id) continue;

      // Monthly-cap check
      const cap = await getPledgeMonthlyCap(p.pledgeId);
      if (cap !== null) {
        const alreadyCharged = await getMonthlyChargedCents(p.pledgeId, matchDate);
        if (alreadyCharged + p.amountCents > cap) continue;
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
          // Saison-Ende = 30. Juni des aktuellen Saison-Jahrs (vereinfacht)
          const now = new Date();
          const seasonEnd =
            now.getMonth() <= 5
              ? new Date(`${now.getFullYear()}-06-30T23:59:59Z`)
              : new Date(`${now.getFullYear() + 1}-06-30T23:59:59Z`);
          await tx.insert(eventApprovals).values({
            matchEventId: created.id,
            pledgeRuleId: p.pledgeRuleId,
            status: "pending",
            expiresAt: seasonEnd
          });
          approvalCount++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("unique") || msg.includes("duplicate")) continue;
        throw err;
      }
    }

    return { eventId: created.id, charges: chargeCount, approvals: approvalCount };
  });

  revalidatePath(`/verein/${target.club.slug}/spiel/${parsed.matchId}`);

  return result;
}
