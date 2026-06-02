"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import {
  getRequestById,
  rejectConflictClaim,
  applyConflictTakeover
} from "@/lib/db/queries/membership-requests";
import { recordOperatorAction } from "@/lib/db/queries/operator-audit";

const inputSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["claimant_wins", "reject_claim"]),
  reason: z.string().max(500).optional()
});

export async function resolveConflictAction(input: z.infer<typeof inputSchema>) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  const req = await getRequestById(parsed.data.requestId);
  if (!req) return { ok: false as const, error: "Konflikt-Anfrage nicht gefunden" };

  if (parsed.data.decision === "reject_claim") {
    await rejectConflictClaim({
      requestId: req.id,
      respondedByUserId: admin.id,
      reason: parsed.data.reason ?? null
    });
    await recordOperatorAction({
      operatorUserId: admin.id,
      action: "conflict.reject_claim",
      targetType: "club",
      targetId: req.clubId,
      summary: `Konflikt-Claim abgelehnt (Club ${req.clubId})`,
      diff: { requestId: req.id, claimantUserId: req.userId, reason: parsed.data.reason ?? null }
    });
    revalidatePath("/admin/conflicts");
    return { ok: true as const, action: "rejected" as const };
  }

  // claimant_wins: account takeover
  await applyConflictTakeover({
    requestId: req.id,
    clubId: req.clubId,
    claimantUserId: req.userId,
    respondedByUserId: admin.id,
    reason: parsed.data.reason ?? null
  });

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "conflict.claimant_takeover",
    targetType: "club",
    targetId: req.clubId,
    summary: `Account-Takeover: Club ${req.clubId} an neuen Admin übertragen`,
    diff: { requestId: req.id, newAdminUserId: req.userId, reason: parsed.data.reason ?? null }
  });

  revalidatePath("/admin/conflicts");
  revalidatePath("/admin/verifications");
  return { ok: true as const, action: "takeover" as const };
}
