"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { eventApprovals, charges } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { getApprovalForUpdate } from "@/lib/db/queries/approvals";

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
  return { ok: true };
}
