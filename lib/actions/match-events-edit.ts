"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { matches, teams, clubs } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { assertClubWriteAccess } from "@/lib/auth/scope";
import {
  updateMatchEvent,
  deleteMatchEvent,
  overrideMatchResultQuery
} from "@/lib/db/queries/match-events-edit";
import { inngest } from "@/lib/inngest/client";

/**
 * Plan 3 Teil 2 — Match-Event-Editor Server Actions.
 *
 * Separate Datei zu `match-events.ts` (User-Territory, addManualEvent).
 *
 * Surface:
 *   - editMatchEventAction(matchEventId, patch) — Trainer-Scope
 *   - deleteMatchEventAction(matchEventId)      — Trainer-Scope
 *   - overrideMatchResultAction(matchId, ...)   — Trainer-Scope
 *
 * Alle Actions invalidieren die durch das Event/Ergebnis entstandenen
 * Charges (siehe queries/match-events-edit.ts) und feuern danach
 * `match/finished` an Inngest, damit `evaluate-match` neu zählt.
 */

// ───────────────────────── Helpers ──────────────────────────

async function loadMatchScope(
  matchEventIdOrMatchId: string,
  by: "matchEvent" | "match"
): Promise<{ matchId: string; teamId: string; clubSlug: string } | null> {
  if (by === "matchEvent") {
    const { matchEvents } = await import("@/lib/db/schema");
    const [row] = await db
      .select({
        matchId: matchEvents.matchId,
        teamId: teams.id,
        clubSlug: clubs.slug
      })
      .from(matchEvents)
      .innerJoin(matches, eq(matchEvents.matchId, matches.id))
      .innerJoin(teams, eq(matches.teamId, teams.id))
      .innerJoin(clubs, eq(teams.clubId, clubs.id))
      .where(eq(matchEvents.id, matchEventIdOrMatchId))
      .limit(1);
    return row ?? null;
  } else {
    const [row] = await db
      .select({
        matchId: matches.id,
        teamId: teams.id,
        clubSlug: clubs.slug
      })
      .from(matches)
      .innerJoin(teams, eq(matches.teamId, teams.id))
      .innerJoin(clubs, eq(teams.clubId, clubs.id))
      .where(eq(matches.id, matchEventIdOrMatchId))
      .limit(1);
    return row ?? null;
  }
}

// ───────────────────────── editMatchEventAction ──────────────────────────

const editSchema = z.object({
  matchEventId: z.string().min(1),
  minute: z.number().int().min(0).max(130).optional(),
  type: z.enum(["tor", "auswechslung", "spezial", "karte"]).optional(),
  subtype: z.string().nullable().optional(),
  playerName: z.string().max(60).nullable().optional()
});

export type EditMatchEventInput = z.infer<typeof editSchema>;

export async function editMatchEventAction(
  input: EditMatchEventInput
): Promise<{
  invalidatedCharges: number;
  expiredApprovals: number;
  matchId: string;
}> {
  const user = await requireUser();
  const parsed = editSchema.parse(input);

  const scope = await loadMatchScope(parsed.matchEventId, "matchEvent");
  if (!scope) throw new Error("Match-Event nicht gefunden.");

  await assertClubWriteAccess(scope.clubSlug, "trainer");

  const result = await updateMatchEvent(
    parsed.matchEventId,
    {
      minute: parsed.minute,
      type: parsed.type,
      subtype: parsed.subtype === undefined ? undefined : parsed.subtype,
      playerName:
        parsed.playerName === undefined ? undefined : parsed.playerName
    },
    user.id
  );

  // Re-Eval triggern, damit `evaluate-match` neue Charges berechnet
  await inngest.send({
    name: "match/finished",
    data: { matchId: result.matchId, teamId: scope.teamId }
  });

  revalidatePath(`/verein/${scope.clubSlug}/spiel/${result.matchId}`);
  revalidatePath(
    `/verein/${scope.clubSlug}/mannschaft/${scope.teamId}/spiele/${result.matchId}`
  );

  return result;
}

// ───────────────────────── deleteMatchEventAction ──────────────────────────

const deleteSchema = z.object({
  matchEventId: z.string().min(1)
});

export async function deleteMatchEventAction(
  input: z.infer<typeof deleteSchema>
): Promise<{ invalidatedCharges: number; matchId: string }> {
  const user = await requireUser();
  const parsed = deleteSchema.parse(input);

  const scope = await loadMatchScope(parsed.matchEventId, "matchEvent");
  if (!scope) throw new Error("Match-Event nicht gefunden.");

  await assertClubWriteAccess(scope.clubSlug, "trainer");

  const result = await deleteMatchEvent(parsed.matchEventId, user.id);

  await inngest.send({
    name: "match/finished",
    data: { matchId: result.matchId, teamId: scope.teamId }
  });

  revalidatePath(`/verein/${scope.clubSlug}/spiel/${result.matchId}`);
  revalidatePath(
    `/verein/${scope.clubSlug}/mannschaft/${scope.teamId}/spiele/${result.matchId}`
  );

  return result;
}

// ───────────────────────── overrideMatchResultAction ──────────────────────────

const overrideSchema = z.object({
  matchId: z.string().min(1),
  ergebnisHeim: z.number().int().min(0).max(30),
  ergebnisGast: z.number().int().min(0).max(30),
  halbzeitHeim: z.number().int().min(0).max(30).nullable().optional(),
  halbzeitGast: z.number().int().min(0).max(30).nullable().optional(),
  reason: z
    .string()
    .min(3, "Bitte gib einen Grund (mind. 3 Zeichen) an.")
    .max(300)
});

export type OverrideMatchResultInput = z.infer<typeof overrideSchema>;

export async function overrideMatchResultAction(
  input: OverrideMatchResultInput
): Promise<{ invalidatedCharges: number; matchId: string }> {
  const user = await requireUser();
  const parsed = overrideSchema.parse(input);

  const scope = await loadMatchScope(parsed.matchId, "match");
  if (!scope) throw new Error("Match nicht gefunden.");

  await assertClubWriteAccess(scope.clubSlug, "trainer");

  const result = await overrideMatchResultQuery(
    parsed.matchId,
    {
      ergebnisHeim: parsed.ergebnisHeim,
      ergebnisGast: parsed.ergebnisGast,
      halbzeitHeim: parsed.halbzeitHeim ?? null,
      halbzeitGast: parsed.halbzeitGast ?? null
    },
    parsed.reason,
    user.id
  );

  await inngest.send({
    name: "match/finished",
    data: { matchId: result.matchId, teamId: scope.teamId }
  });

  revalidatePath(`/verein/${scope.clubSlug}/spiel/${result.matchId}`);
  revalidatePath(
    `/verein/${scope.clubSlug}/mannschaft/${scope.teamId}/spiele/${result.matchId}`
  );

  return result;
}
