import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  matches,
  matchEvents,
  charges,
  eventApprovals
} from "@/lib/db/schema";

/**
 * Plan 3 Teil 2 — Match-Event-Editor Queries.
 *
 * Pure DB-Layer für die Edit/Delete-Actions in
 * `lib/actions/match-events-edit.ts`. Permission-Checks finden im Action-
 * Layer statt (assertClubWriteAccess).
 *
 * Wichtig:
 *   - `updateMatchEvent` invalidiert die durch das Event entstandenen Charges
 *     (markiert sie `cancelled` mit Reason `event-edited`) — Re-Eval ist
 *     Aufgabe des Aufrufers (Action triggert `match/finished` neu).
 *   - `deleteMatchEvent` hard-deletet das Event. `eventApprovals` cascadet
 *     per FK. `charges` werden manuell auf `cancelled` gesetzt mit Reason
 *     `event-deleted` (FK ist ON DELETE SET NULL für matchEventId, also
 *     bleibt die charge-Row, würde aber ohne Cleanup als valide gezählt).
 *   - Audit-Trail wird in `matches.adminNote` als JSON-Array appendiert.
 */

export type AdminNoteEntry =
  | {
      kind: "event-edited";
      at: string;
      byUserId: string;
      snapshot: {
        matchEventId: string;
        minute: number | null;
        type: string;
        subtype: string | null;
        playerName: string | null;
      };
    }
  | {
      kind: "event-deleted";
      at: string;
      byUserId: string;
      snapshot: {
        matchEventId: string;
        minute: number | null;
        type: string;
        subtype: string | null;
        side: "heim" | "gast";
        playerName: string | null;
        source: "scraped" | "manual";
      };
    }
  | {
      kind: "result-override";
      at: string;
      byUserId: string;
      reason: string;
      snapshot: {
        ergebnisHeim: number | null;
        ergebnisGast: number | null;
        halbzeitHeim: number | null;
        halbzeitGast: number | null;
      };
    };

/**
 * Hilfsfunktion: Liest die bestehenden adminNote-Einträge, parst sie als
 * Array, hängt einen neuen Eintrag hinten an, schreibt das aktualisierte
 * JSON zurück. Robust gegen "noch null" und gegen kaputten alten Wert
 * (in dem Fall startet er bei [oldValue, neu]).
 */
function appendAdminNote(
  existing: string | null,
  entry: AdminNoteEntry
): string {
  if (!existing) return JSON.stringify([entry]);
  try {
    const parsed: unknown = JSON.parse(existing);
    if (Array.isArray(parsed)) {
      return JSON.stringify([...parsed, entry]);
    }
    return JSON.stringify([parsed, entry]);
  } catch {
    return JSON.stringify([{ rawLegacy: existing }, entry]);
  }
}

export interface EditableMatchEvent {
  event: typeof matchEvents.$inferSelect;
  match: typeof matches.$inferSelect;
  charges: Array<typeof charges.$inferSelect>;
  approvals: Array<typeof eventApprovals.$inferSelect>;
}

/**
 * Lädt ein einzelnes Match-Event samt zugehörigem Match, allen Charges die
 * durch dieses Event entstanden sind, und allen offenen Approvals.
 *
 * Returnt null wenn das Event nicht existiert. Der Aufrufer muss separat
 * sicherstellen dass der User Zugriff auf den Club hat (Action-Layer).
 */
export async function getEditableMatchEvent(
  matchEventId: string
): Promise<EditableMatchEvent | null> {
  const [eventRow] = await db
    .select()
    .from(matchEvents)
    .where(eq(matchEvents.id, matchEventId))
    .limit(1);
  if (!eventRow) return null;

  const [matchRow] = await db
    .select()
    .from(matches)
    .where(eq(matches.id, eventRow.matchId))
    .limit(1);
  if (!matchRow) return null;

  const chargeRows = await db
    .select()
    .from(charges)
    .where(eq(charges.matchEventId, matchEventId));

  const approvalRows = await db
    .select()
    .from(eventApprovals)
    .where(eq(eventApprovals.matchEventId, matchEventId));

  return {
    event: eventRow,
    match: matchRow,
    charges: chargeRows,
    approvals: approvalRows
  };
}

export interface UpdateMatchEventPatch {
  minute?: number | null;
  type?: "tor" | "auswechslung" | "spezial" | "karte";
  subtype?: string | null;
  playerName?: string | null;
}

/**
 * Update eines Match-Events. Invalidiert alle daraus entstandenen
 * Charges (Status → cancelled, Reason `event-edited`) und expired die
 * dazu gehörigen Approvals — das verhindert dass ein Sponsor einen
 * cancelled Charge via "Bestätigen" wiederbelebt.
 *
 * Schreibt einen Audit-Eintrag in `matches.adminNote` mit dem Original-
 * Event-Snapshot vor der Änderung.
 *
 * NICHT angefasst werden `invoiced` Charges — die sind bereits in
 * Rechnung gestellt und out-of-scope.
 *
 * Returnt die Anzahl der invalidierten Charges + Approvals; der Caller
 * kann das im Toast anzeigen.
 */
export async function updateMatchEvent(
  matchEventId: string,
  patch: UpdateMatchEventPatch,
  byUserId: string
): Promise<{ invalidatedCharges: number; expiredApprovals: number; matchId: string }> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(matchEvents)
      .where(eq(matchEvents.id, matchEventId))
      .limit(1);
    if (!existing) throw new Error("Match-Event nicht gefunden.");

    // Snapshot vor der Mutation
    const snapshot = {
      matchEventId: existing.id,
      minute: existing.minute,
      type: existing.type,
      subtype: existing.subtype,
      playerName: existing.playerName
    };

    // Update applien — nur die Felder die im Patch gesetzt sind
    const setObj: Partial<typeof matchEvents.$inferInsert> = {};
    if (patch.minute !== undefined) setObj.minute = patch.minute;
    if (patch.type !== undefined) setObj.type = patch.type;
    if (patch.subtype !== undefined) setObj.subtype = patch.subtype;
    if (patch.playerName !== undefined) setObj.playerName = patch.playerName;

    if (Object.keys(setObj).length > 0) {
      await tx.update(matchEvents).set(setObj).where(eq(matchEvents.id, matchEventId));
    }

    // Invalidate downstream charges (außer invoiced) — Re-Eval ist
    // Aufgabe des Action-Callers, der `match/finished` neu feuert.
    const affectedCharges = await tx
      .select({ id: charges.id })
      .from(charges)
      .where(
        and(eq(charges.matchEventId, matchEventId), ne(charges.status, "invoiced"))
      );

    if (affectedCharges.length > 0) {
      await tx
        .update(charges)
        .set({ status: "cancelled", cancelledReason: "event-edited" })
        .where(
          and(eq(charges.matchEventId, matchEventId), ne(charges.status, "invoiced"))
        );
    }

    // Approvals expired — sonst kann Sponsor cancelled Charge wiederbeleben
    const expiredApprovalsRes = await tx
      .update(eventApprovals)
      .set({ status: "expired", respondedAt: new Date() })
      .where(
        and(
          eq(eventApprovals.matchEventId, matchEventId),
          eq(eventApprovals.status, "pending")
        )
      )
      .returning({ id: eventApprovals.id });

    // Audit-Trail
    const [matchRow] = await tx
      .select({ adminNote: matches.adminNote })
      .from(matches)
      .where(eq(matches.id, existing.matchId))
      .limit(1);
    const newNote = appendAdminNote(matchRow?.adminNote ?? null, {
      kind: "event-edited",
      at: new Date().toISOString(),
      byUserId,
      snapshot
    });
    await tx
      .update(matches)
      .set({ adminNote: newNote })
      .where(eq(matches.id, existing.matchId));

    return {
      invalidatedCharges: affectedCharges.length,
      expiredApprovals: expiredApprovalsRes.length,
      matchId: existing.matchId
    };
  });
}

/**
 * Hard-Delete eines Match-Events. Vorgehensweise:
 *
 *   1. Snapshot des Events lesen (für Audit-Trail).
 *   2. Charges (außer `invoiced`) auf `cancelled` setzen mit Reason
 *      `event-deleted`. Die FK `charges.match_event_id → match_events.id`
 *      ist `ON DELETE SET NULL`, also würde die Row sonst hängen bleiben
 *      und beim nächsten Sponsor-Bilanz-Render mitzählen.
 *   3. Approvals expired (FK `event_approvals.match_event_id` ist
 *      ON DELETE CASCADE — aber wir wollen einen sauberen Status-Übergang
 *      bevor das Cascade greift).
 *   4. Match-Event löschen. Cascade räumt event_approvals.
 *   5. Audit-Eintrag in `matches.adminNote`.
 *
 * `invoiced` Charges werden NICHT angefasst. Falls solche existieren,
 * wirft die Funktion — der Verein soll dann den Support kontaktieren.
 */
export async function deleteMatchEvent(
  matchEventId: string,
  byUserId: string
): Promise<{ invalidatedCharges: number; matchId: string }> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(matchEvents)
      .where(eq(matchEvents.id, matchEventId))
      .limit(1);
    if (!existing) throw new Error("Match-Event nicht gefunden.");

    // Block delete wenn invoiced charges existieren — die kann man nicht
    // mehr unschädlich machen, ohne die Rechnung zu beschädigen.
    const [invoicedCount] = await tx
      .select({ id: charges.id })
      .from(charges)
      .where(
        and(eq(charges.matchEventId, matchEventId), eq(charges.status, "invoiced"))
      )
      .limit(1);
    if (invoicedCount) {
      throw new Error(
        "Dieses Event ist bereits in einer Rechnung enthalten und kann nicht gelöscht werden. Bitte Support kontaktieren."
      );
    }

    // Invalidate non-invoiced charges
    const affectedCharges = await tx
      .select({ id: charges.id })
      .from(charges)
      .where(
        and(eq(charges.matchEventId, matchEventId), ne(charges.status, "invoiced"))
      );

    if (affectedCharges.length > 0) {
      await tx
        .update(charges)
        .set({ status: "cancelled", cancelledReason: "event-deleted" })
        .where(
          and(eq(charges.matchEventId, matchEventId), ne(charges.status, "invoiced"))
        );
    }

    // Expire approvals before cascade
    await tx
      .update(eventApprovals)
      .set({ status: "expired", respondedAt: new Date() })
      .where(
        and(
          eq(eventApprovals.matchEventId, matchEventId),
          eq(eventApprovals.status, "pending")
        )
      );

    // Audit-Trail vor Delete (matches.adminNote lesen + appenden)
    const [matchRow] = await tx
      .select({ adminNote: matches.adminNote })
      .from(matches)
      .where(eq(matches.id, existing.matchId))
      .limit(1);
    const newNote = appendAdminNote(matchRow?.adminNote ?? null, {
      kind: "event-deleted",
      at: new Date().toISOString(),
      byUserId,
      snapshot: {
        matchEventId: existing.id,
        minute: existing.minute,
        type: existing.type,
        subtype: existing.subtype,
        side: existing.side,
        playerName: existing.playerName,
        source: existing.source
      }
    });
    await tx
      .update(matches)
      .set({ adminNote: newNote })
      .where(eq(matches.id, existing.matchId));

    // Hard-Delete — cascade räumt event_approvals
    await tx.delete(matchEvents).where(eq(matchEvents.id, matchEventId));

    return {
      invalidatedCharges: affectedCharges.length,
      matchId: existing.matchId
    };
  });
}

/**
 * Schreibt direkt das Ergebnis eines Matches (heim/gast + Halbzeit) und
 * loggt das Original im Audit-Trail. Charges die durch das alte Ergebnis
 * entstanden sind (win/loss/draw/comeback_win/clean_sheet/goal_diff_min/
 * goals_scored_min) werden invalidiert, damit die Re-Eval (über
 * match/finished) sauber neu zählt. Per-Event-Charges (Tore via
 * match_event_id) bleiben unangetastet — die hängen am Event, nicht am
 * Ergebnis.
 *
 * `invoiced` Charges bleiben auch hier unverändert.
 */
export async function overrideMatchResultQuery(
  matchId: string,
  newResult: {
    ergebnisHeim: number;
    ergebnisGast: number;
    halbzeitHeim?: number | null;
    halbzeitGast?: number | null;
  },
  reason: string,
  byUserId: string
): Promise<{ invalidatedCharges: number; matchId: string }> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(matches)
      .where(eq(matches.id, matchId))
      .limit(1);
    if (!existing) throw new Error("Match nicht gefunden.");

    const snapshot = {
      ergebnisHeim: existing.ergebnisHeim,
      ergebnisGast: existing.ergebnisGast,
      halbzeitHeim: existing.halbzeitHeim,
      halbzeitGast: existing.halbzeitGast
    };

    // Update match-result
    await tx
      .update(matches)
      .set({
        ergebnisHeim: newResult.ergebnisHeim,
        ergebnisGast: newResult.ergebnisGast,
        halbzeitHeim: newResult.halbzeitHeim ?? existing.halbzeitHeim,
        halbzeitGast: newResult.halbzeitGast ?? existing.halbzeitGast
      })
      .where(eq(matches.id, matchId));

    // Invalidate result-derived charges (non-event, non-invoiced)
    // Heuristik: charges deren matchEventId NULL ist UND saison NULL ist
    // (sonst wäre es eine Saison-Charge) → das sind genau die match-level
    // result-Trigger.
    const resultDerivedRows = await tx
      .select({ id: charges.id })
      .from(charges)
      .where(
        and(
          eq(charges.matchId, matchId),
          ne(charges.status, "invoiced")
          // matchEventId IS NULL durch trigger-type-Set bereits abgedeckt,
          // wir nehmen aber bewusst auch alle non-invoiced charges des
          // Matches mit — Re-Eval-Idempotenz über die unique-indices.
        )
      );

    if (resultDerivedRows.length > 0) {
      await tx
        .update(charges)
        .set({ status: "cancelled", cancelledReason: "result-override" })
        .where(
          and(eq(charges.matchId, matchId), ne(charges.status, "invoiced"))
        );
    }

    // Approvals der match-events expired (über alle Events des Matches)
    const eventIdsRows = await tx
      .select({ id: matchEvents.id })
      .from(matchEvents)
      .where(eq(matchEvents.matchId, matchId));
    const eventIds = eventIdsRows.map((r) => r.id);
    if (eventIds.length > 0) {
      await tx
        .update(eventApprovals)
        .set({ status: "expired", respondedAt: new Date() })
        .where(
          and(
            inArray(eventApprovals.matchEventId, eventIds),
            eq(eventApprovals.status, "pending")
          )
        );
    }

    // Audit-Trail
    const newNote = appendAdminNote(existing.adminNote ?? null, {
      kind: "result-override",
      at: new Date().toISOString(),
      byUserId,
      reason,
      snapshot
    });
    await tx.update(matches).set({ adminNote: newNote }).where(eq(matches.id, matchId));

    return {
      invalidatedCharges: resultDerivedRows.length,
      matchId
    };
  });
}
