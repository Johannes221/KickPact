"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { eventApprovals, charges } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { getApprovalForUpdate, getApprovalById } from "@/lib/db/queries/approvals";
import { verifyApprovalToken } from "@/lib/auth/approval-token";

const disputeSchema = z.object({
  approvalId: z.string().min(1),
  reason: z.string().max(500).optional()
});

/**
 * A8 (Audit 2026-06-11): Fehler als `{ ok: false, message }` statt Throw —
 * Next.js redacted aus Server-Actions geworfene Errors in Production zur
 * generischen Meldung; über den Rückgabewert erreicht der deutsche Klartext
 * den Client-Toast. Pattern: create-pledge.ts.
 */
export type ApprovalActionResult =
  | { ok: true }
  | { ok: false; message: string };

export async function confirmApproval(
  approvalId: string
): Promise<ApprovalActionResult> {
  const user = await requireUser();
  const row = await getApprovalForUpdate(approvalId, user.id);
  if (!row) {
    return { ok: false, message: "Approval nicht gefunden oder nicht autorisiert." };
  }
  if (row.approval.status !== "pending") {
    return { ok: false, message: `Approval ist bereits ${row.approval.status}.` };
  }

  // Audit 2026-05-24 Task 2.3: defense-in-depth gegen Charge-Wiederbelebung.
  // C4 (Audit 2026-06-11): explizit die NEUESTE pending_approval-Charge
  // selektieren. Nach Invalidate+Re-Eval liegen für (rule, event) zwei
  // Charges (cancelled + neu pending) — der frühere ungeordnete `LIMIT 1`
  // konnte die stornierte treffen und blockierte dann die legitime
  // Bestätigung der neuen Charge für immer.
  const [chargeRow] = await db
    .select({ status: charges.status })
    .from(charges)
    .where(
      and(
        eq(charges.pledgeRuleId, row.pledgeRuleId),
        eq(charges.matchEventId, row.matchEventId),
        eq(charges.status, "pending_approval")
      )
    )
    .orderBy(desc(charges.createdAt))
    .limit(1);
  if (!chargeRow) {
    return {
      ok: false,
      message:
        "Das Ereignis wurde inzwischen vom Spielbericht widerrufen und kann nicht mehr bestätigt werden."
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(eventApprovals)
      .set({ status: "confirmed", respondedAt: new Date() })
      .where(eq(eventApprovals.id, approvalId));

    // Charge confirmen (eindeutig: gleicher pledge_rule + match_event)
    await tx
      .update(charges)
      .set({ status: "confirmed", confirmedAt: new Date() })
      .where(
        and(
          eq(charges.pledgeRuleId, row.pledgeRuleId),
          eq(charges.matchEventId, row.matchEventId),
          eq(charges.status, "pending_approval")
        )
      );
  });

  revalidatePath("/sponsor/inbox");
  revalidatePath("/sponsor");
  return { ok: true };
}

/**
 * Batch-Bestätigung (Tier-3-Usability): Manual-Teams (coverage=none) erzeugen
 * pro Tor + pro Outcome eine eigene Approval-Zeile — ein 8:0-Spiel = viele
 * Einzel-Bestätigungen. `confirmApprovals` bestätigt eine ganze (UI-seitig nach
 * Spiel gruppierte) Auswahl in einem Aufruf. Jede ID läuft durch denselben
 * Tenant-/Status-/Widerruf-Check wie das Einzel-`confirmApproval`; fremde,
 * bereits erledigte oder inzwischen widerrufene Approvals werden übersprungen
 * (nie client-gelieferten IDs vertrauen). Rückgabe: Anzahl tatsächlich
 * bestätigter Beiträge.
 */
export async function confirmApprovals(
  approvalIds: string[]
): Promise<{ ok: true; confirmed: number } | { ok: false; message: string }> {
  const user = await requireUser();
  const ids = [...new Set(approvalIds)].filter((id) => typeof id === "string" && id.length > 0);
  if (ids.length === 0) {
    return { ok: false, message: "Keine Auswahl übergeben." };
  }
  if (ids.length > 200) {
    return { ok: false, message: "Zu viele Einträge auf einmal." };
  }

  let confirmed = 0;
  for (const approvalId of ids) {
    const row = await getApprovalForUpdate(approvalId, user.id);
    // Fremd, nicht gefunden oder nicht mehr pending → still überspringen.
    if (!row || row.approval.status !== "pending") continue;

    const didConfirm = await db.transaction(async (tx) => {
      // Nur die (ggf. neueste) pending_approval-Charge treffen — cancelled bleibt
      // unberührt (C4). `.returning()` erkennt zwischenzeitlich widerrufene Events.
      const updated = await tx
        .update(charges)
        .set({ status: "confirmed", confirmedAt: new Date() })
        .where(
          and(
            eq(charges.pledgeRuleId, row.pledgeRuleId),
            eq(charges.matchEventId, row.matchEventId),
            eq(charges.status, "pending_approval")
          )
        )
        .returning({ id: charges.id });
      if (updated.length === 0) return false;

      await tx
        .update(eventApprovals)
        .set({ status: "confirmed", respondedAt: new Date() })
        .where(eq(eventApprovals.id, approvalId));
      return true;
    });
    if (didConfirm) confirmed += 1;
  }

  if (confirmed > 0) {
    revalidatePath("/sponsor/inbox");
    revalidatePath("/sponsor");
  }
  return { ok: true, confirmed };
}

export async function disputeApproval(input: {
  approvalId: string;
  reason?: string;
}): Promise<ApprovalActionResult> {
  const user = await requireUser();
  const parsedResult = disputeSchema.safeParse(input);
  if (!parsedResult.success) {
    return {
      ok: false,
      message:
        parsedResult.error.issues[0]?.message ??
        "Ungültige Eingabe — bitte prüfen."
    };
  }
  const parsed = parsedResult.data;
  const row = await getApprovalForUpdate(parsed.approvalId, user.id);
  if (!row) {
    return { ok: false, message: "Approval nicht gefunden oder nicht autorisiert." };
  }
  if (row.approval.status !== "pending") {
    return { ok: false, message: `Approval ist bereits ${row.approval.status}.` };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(eventApprovals)
      .set({
        status: "disputed",
        respondedAt: new Date(),
        disputeReason: parsed.reason ?? null
      })
      .where(eq(eventApprovals.id, parsed.approvalId));

    await tx
      .update(charges)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(charges.pledgeRuleId, row.pledgeRuleId),
          eq(charges.matchEventId, row.matchEventId),
          eq(charges.status, "pending_approval")
        )
      );
  });

  revalidatePath("/sponsor/inbox");
  revalidatePath("/sponsor");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Token-basierte Actions (kein requireUser — für E-Mail-Links)
// ---------------------------------------------------------------------------

/**
 * SECURITY (L1): Einstiegspunkt für die /approve-Seite. Verifiziert den Token,
 * leitet die Aktion ab und MUTIERT nur bei explizitem Aufruf (POST/Form-Submit),
 * nie beim reinen Seiten-Render. Verhindert, dass Mail-Prefetcher/Link-Scanner
 * durch ein GET versehentlich eine Charge bestätigen/bestreiten.
 */
export async function respondApprovalByToken(
  token: string
): Promise<{ ok: true; action: "confirm" | "dispute" } | { ok: false; error: string }> {
  let action: "confirm" | "dispute";
  try {
    action = verifyApprovalToken(token).action;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ungültiger Link." };
  }
  const result =
    action === "confirm"
      ? await confirmApprovalByToken(token)
      : await disputeApprovalByToken(token);
  return result.ok ? { ok: true, action } : result;
}

export async function confirmApprovalByToken(
  token: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  let approvalId: string;
  try {
    const payload = verifyApprovalToken(token);
    if (payload.action !== "confirm") {
      return { ok: false, error: "Ungültiger Token für diese Aktion." };
    }
    approvalId = payload.approvalId;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ungültiger Link." };
  }

  const row = await getApprovalById(approvalId);
  if (!row) return { ok: false, error: "Approval nicht gefunden." };

  // Idempotent: bereits confirmed → trotzdem OK
  if (row.approval.status === "confirmed") return { ok: true };

  if (row.approval.status !== "pending") {
    return { ok: false, error: `Approval ist bereits ${row.approval.status}.` };
  }

  // C4 (Audit 2026-06-11): siehe confirmApproval — neueste pending-Charge
  // selektieren statt ungeordnetem LIMIT 1 (cancelled+pending-Paar).
  const [chargeRow] = await db
    .select({ status: charges.status })
    .from(charges)
    .where(
      and(
        eq(charges.pledgeRuleId, row.pledgeRuleId),
        eq(charges.matchEventId, row.matchEventId),
        eq(charges.status, "pending_approval")
      )
    )
    .orderBy(desc(charges.createdAt))
    .limit(1);
  if (!chargeRow) {
    return {
      ok: false,
      error:
        "Das Ereignis wurde inzwischen vom Spielbericht widerrufen und kann nicht mehr bestätigt werden."
    };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(eventApprovals)
      .set({ status: "confirmed", respondedAt: new Date() })
      .where(eq(eventApprovals.id, approvalId));

    await tx
      .update(charges)
      .set({ status: "confirmed", confirmedAt: new Date() })
      .where(
        and(
          eq(charges.pledgeRuleId, row.pledgeRuleId),
          eq(charges.matchEventId, row.matchEventId),
          eq(charges.status, "pending_approval")
        )
      );
  });

  revalidatePath("/sponsor/inbox");
  revalidatePath("/sponsor");
  return { ok: true };
}

export async function disputeApprovalByToken(
  token: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  let approvalId: string;
  try {
    const payload = verifyApprovalToken(token);
    if (payload.action !== "dispute") {
      return { ok: false, error: "Ungültiger Token für diese Aktion." };
    }
    approvalId = payload.approvalId;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ungültiger Link." };
  }

  const row = await getApprovalById(approvalId);
  if (!row) return { ok: false, error: "Approval nicht gefunden." };

  // Idempotent: bereits disputed → trotzdem OK
  if (row.approval.status === "disputed") return { ok: true };

  if (row.approval.status !== "pending") {
    return { ok: false, error: `Approval ist bereits ${row.approval.status}.` };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(eventApprovals)
      .set({ status: "disputed", respondedAt: new Date(), disputeReason: null })
      .where(eq(eventApprovals.id, approvalId));

    await tx
      .update(charges)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(charges.pledgeRuleId, row.pledgeRuleId),
          eq(charges.matchEventId, row.matchEventId),
          eq(charges.status, "pending_approval")
        )
      );
  });

  revalidatePath("/sponsor/inbox");
  revalidatePath("/sponsor");
  return { ok: true };
}
