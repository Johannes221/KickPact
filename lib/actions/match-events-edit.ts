"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { matches, teams, clubs } from "@/lib/db/schema";
import { matchEvents } from "@/lib/db/schema/matches";
import { requireUser } from "@/lib/auth/session";
import { assertClubWriteAccessAllowPaused } from "@/lib/auth/scope";
import { validateSubtype } from "@/lib/validations/match-events";
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
 *
 * Gate = `assertClubWriteAccessAllowPaused`: In der Saison-Pass-Sommerpause
 * (status=paused) ist der Verein read-only, wird aber WEITER gechargt
 * (`isChargeBlockedByGate` blockt paused nicht — Juni-Charges laufen bis 30.6.).
 * Diese drei Actions korrigieren falsch übernommene Ergebnisse/Events und die
 * dadurch entstandenen Fehl-Charges; sie müssen im selben Fenster laufen, in dem
 * das System noch Charges erzeugt — sonst stünden Fehl-Charges bis zum Resume
 * (1.8.) unkorrigierbar in der Abrechnung. Konsistent mit season-results.ts.
 * NUR Korrektur: Neuanlage (addManualEvent, match-events.ts) bleibt bewusst am
 * strikten `assertClubWriteAccess` und ist in der Pause weiter gesperrt.
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

export type EditMatchEventResult =
  | {
      ok: true;
      invalidatedCharges: number;
      expiredApprovals: number;
      matchId: string;
    }
  | { ok: false; message: string };

export async function editMatchEventAction(
  input: EditMatchEventInput
): Promise<EditMatchEventResult> {
  const user = await requireUser();
  const parsedResult = editSchema.safeParse(input);
  if (!parsedResult.success) {
    return { ok: false, message: "Ungültige Eingabe." };
  }
  const parsed = parsedResult.data;

  const scope = await loadMatchScope(parsed.matchEventId, "matchEvent");
  if (!scope) return { ok: false, message: "Match-Event nicht gefunden." };

  await assertClubWriteAccessAllowPaused(scope.clubSlug, "trainer"); // paused: siehe Docblock

  // B3-Folge + Review M1 (Audit 2026-06-11): auch der EDIT-Pfad validiert den
  // subtype — aber NUR wenn er sich gegenüber dem Bestand wirklich ändert.
  // Sonst werden Legacy-Events (volley/fernschuss aus der Alt-Liste)
  // uneditierbar: das Formular sendet den bestehenden subtype immer mit, und
  // schon eine reine Minuten-Korrektur scheiterte an der Validierung.
  // {ok,message} statt throw: Next.js redacted geworfene Server-Action-Fehler
  // in Production (A8-Pattern).
  if (parsed.subtype !== undefined && parsed.subtype !== null) {
    const [eventRow] = await db
      .select({ type: matchEvents.type, subtype: matchEvents.subtype })
      .from(matchEvents)
      .where(eq(matchEvents.id, parsed.matchEventId))
      .limit(1);
    const subtypeChanged = eventRow?.subtype !== parsed.subtype;
    const effectiveType = parsed.type ?? eventRow?.type;
    if (subtypeChanged && effectiveType) {
      const check = validateSubtype(effectiveType, parsed.subtype);
      if (!check.ok) return { ok: false, message: check.message };
    }
  }

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

  return { ok: true, ...result };
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

  await assertClubWriteAccessAllowPaused(scope.clubSlug, "trainer"); // paused: siehe Docblock

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

  await assertClubWriteAccessAllowPaused(scope.clubSlug, "trainer"); // paused: siehe Docblock

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
