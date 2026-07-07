"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { charges, pledges, sponsors } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import {
  findConfirmCapViolation,
  confirmCapViolationMessage
} from "@/lib/db/queries/evaluation";

/**
 * Bestätigung/Ablehnung DIREKT auf der Charge (Audit 2026-06-11 / C2+C3).
 *
 * Für Charges OHNE matchEvent gibt es keinen eventApprovals-Pfad:
 *  - Saison-Charges (evaluate-season, z.B. season_custom — matchId=null),
 *  - Outcome-Charges mit manueller Tor-Evidenz (hattrick/comeback_win, C3).
 * Diese pending_approval-Charges bestätigt der Sponsor hier direkt.
 * Tenancy: nur der Sponsor des zugehörigen Pledges darf antworten.
 * Expiry: >21 Tage pending → expire-approvals-Cron storniert.
 */

const disputeSchema = z.object({
  chargeId: z.string().min(1),
  reason: z.string().max(500).optional()
});

async function getPendingDirectChargeForUser(
  chargeId: string,
  userId: string
): Promise<
  | {
      id: string;
      status: string;
      pledgeId: string;
      pledgeRuleId: string;
      amountCents: number;
    }
  | undefined
> {
  const [row] = await db
    .select({
      id: charges.id,
      status: charges.status,
      pledgeId: charges.pledgeId,
      pledgeRuleId: charges.pledgeRuleId,
      amountCents: charges.amountCents
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .where(
      and(
        eq(charges.id, chargeId),
        eq(sponsors.userId, userId),
        // Direkt-Bestätigung gibt es NUR für event-lose Charges — event-
        // gebundene laufen über eventApprovals (confirmApproval).
        isNull(charges.matchEventId)
      )
    )
    .limit(1);
  return row;
}

export async function confirmSeasonCharge(chargeId: string) {
  const user = await requireUser();
  const row = await getPendingDirectChargeForUser(chargeId, user.id);
  if (!row) throw new Error("Beitrag nicht gefunden oder nicht autorisiert.");
  if (row.status !== "pending_approval") {
    throw new Error(`Beitrag ist bereits ${row.status}.`);
  }

  // Cap-Enforcement beim Confirm (Root-Fix 2026-07-07): pending zählt nicht
  // gegen den Cap → hier prüfen, dass confirmed+invoiced mit diesem Beitrag den
  // Monats-/Regel-Cap nicht sprengt. FOR-UPDATE-Lock auf den Pledge in der tx.
  await db.transaction(async (tx) => {
    const violation = await findConfirmCapViolation(tx, {
      pledgeId: row.pledgeId,
      pledgeRuleId: row.pledgeRuleId,
      amountCents: row.amountCents,
      asOf: new Date()
    });
    if (violation) throw new Error(confirmCapViolationMessage(violation));

    await tx
      .update(charges)
      .set({ status: "confirmed", confirmedAt: new Date() })
      .where(and(eq(charges.id, chargeId), eq(charges.status, "pending_approval")));
  });

  revalidatePath("/sponsor/inbox");
  revalidatePath("/sponsor");
  return { ok: true as const };
}

export async function disputeSeasonCharge(input: { chargeId: string; reason?: string }) {
  const user = await requireUser();
  const parsed = disputeSchema.parse(input);
  const row = await getPendingDirectChargeForUser(parsed.chargeId, user.id);
  if (!row) throw new Error("Beitrag nicht gefunden oder nicht autorisiert.");
  if (row.status !== "pending_approval") {
    throw new Error(`Beitrag ist bereits ${row.status}.`);
  }

  await db
    .update(charges)
    .set({
      status: "cancelled",
      cancelledReason: "sponsor_dispute",
      cancelledByUserId: user.id,
      cancelledAt: new Date()
    })
    .where(
      and(eq(charges.id, parsed.chargeId), eq(charges.status, "pending_approval"))
    );

  revalidatePath("/sponsor/inbox");
  revalidatePath("/sponsor");
  return { ok: true as const };
}
