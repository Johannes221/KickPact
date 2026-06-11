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

export async function confirmApproval(approvalId: string) {
  const user = await requireUser();
  const row = await getApprovalForUpdate(approvalId, user.id);
  if (!row) throw new Error("Approval nicht gefunden oder nicht autorisiert.");
  if (row.approval.status !== "pending") {
    throw new Error(`Approval ist bereits ${row.approval.status}.`);
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
    throw new Error(
      "Das Ereignis wurde inzwischen vom Spielbericht widerrufen und kann nicht mehr bestätigt werden."
    );
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
  return { ok: true as const };
}

export async function disputeApproval(input: { approvalId: string; reason?: string }) {
  const user = await requireUser();
  const parsed = disputeSchema.parse(input);
  const row = await getApprovalForUpdate(parsed.approvalId, user.id);
  if (!row) throw new Error("Approval nicht gefunden oder nicht autorisiert.");
  if (row.approval.status !== "pending") {
    throw new Error(`Approval ist bereits ${row.approval.status}.`);
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
  return { ok: true as const };
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
