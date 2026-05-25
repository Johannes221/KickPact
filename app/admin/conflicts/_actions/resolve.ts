"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db/client";
import {
  clubs,
  clubMembershipRequests,
  clubMemberships,
  clubVerifications
} from "@/lib/db/schema";

const inputSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(["claimant_wins", "reject_claim"]),
  reason: z.string().max(500).optional()
});

export async function resolveConflictAction(input: z.infer<typeof inputSchema>) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  const [req] = await db
    .select({
      id: clubMembershipRequests.id,
      userId: clubMembershipRequests.userId,
      clubId: clubMembershipRequests.clubId,
      requestedRole: clubMembershipRequests.requestedRole
    })
    .from(clubMembershipRequests)
    .where(eq(clubMembershipRequests.id, parsed.data.requestId))
    .limit(1);
  if (!req) return { ok: false as const, error: "Konflikt-Anfrage nicht gefunden" };

  if (parsed.data.decision === "reject_claim") {
    await db
      .update(clubMembershipRequests)
      .set({
        status: "rejected",
        respondedAt: new Date(),
        respondedByUserId: admin.id,
        responseMessage: parsed.data.reason ?? null
      })
      .where(eq(clubMembershipRequests.id, req.id));
    revalidatePath("/admin/conflicts");
    return { ok: true as const, action: "rejected" as const };
  }

  // claimant_wins: account takeover
  await db.transaction(async (tx) => {
    // 1. Remove existing admin clubMemberships for this club
    await tx
      .delete(clubMemberships)
      .where(eq(clubMemberships.clubId, req.clubId));

    // 2. Insert claimant as the new admin
    await tx
      .insert(clubMemberships)
      .values({
        userId: req.userId,
        clubId: req.clubId,
        role: "admin"
      })
      .onConflictDoNothing();

    // 3. Mark all prior approved verifications for this club as revoked
    await tx
      .update(clubVerifications)
      .set({ status: "revoked" })
      .where(
        and(
          eq(clubVerifications.clubId, req.clubId),
          eq(clubVerifications.status, "approved")
        )
      );

    // 4. Reset clubs.verifiedAt — the claimant must re-verify too (their
    //    conflict-doc is held as evidence but doesn't auto-promote).
    await tx
      .update(clubs)
      .set({ verifiedAt: null })
      .where(eq(clubs.id, req.clubId));

    // 5. Note: withheld invoices are intentionally NOT auto-mutated here.
    //    Ops can manually clean up if needed — auto-cancelling could either
    //    release funds to the impersonator or destroy legitimate pre-collected
    //    charges. Leave as 'withheld' and let ops decide per-case.

    // 6. Update the conflict request itself
    await tx
      .update(clubMembershipRequests)
      .set({
        status: "approved",
        respondedAt: new Date(),
        respondedByUserId: admin.id,
        responseMessage: parsed.data.reason ?? null
      })
      .where(eq(clubMembershipRequests.id, req.id));
  });

  revalidatePath("/admin/conflicts");
  revalidatePath("/admin/verifications");
  return { ok: true as const, action: "takeover" as const };
}
