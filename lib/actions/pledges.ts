"use server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pledges, sponsors } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";

/** Helper: load pledge + tenant-check. Returns null when not found or wrong user. */
async function loadOwnedPledge(pledgeId: string) {
  const user = await requireUser();
  const [pledge] = await db
    .select({ id: pledges.id, status: pledges.status, sponsorUserId: sponsors.userId })
    .from(pledges)
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .where(eq(pledges.id, pledgeId))
    .limit(1);
  if (!pledge || pledge.sponsorUserId !== user.id) return null;
  return pledge;
}

export async function setPledgeStatus(
  pledgeId: string,
  newStatus: "active" | "paused" | "ended"
): Promise<{ error?: string }> {
  try {
    const pledge = await loadOwnedPledge(pledgeId);
    if (!pledge) return { error: "Pledge nicht gefunden oder kein Zugriff." };

    if (pledge.status === "ended") {
      return { error: "Beendete Pledges können nicht mehr geändert werden." };
    }

    // When ending, also record endsAt = now so the timeline is accurate.
    if (newStatus === "ended") {
      await db
        .update(pledges)
        .set({ status: "ended", endsAt: new Date() })
        .where(eq(pledges.id, pledgeId));
    } else {
      await db
        .update(pledges)
        .set({ status: newStatus })
        .where(eq(pledges.id, pledgeId));
    }

    revalidatePath(`/sponsor/pledge/${pledgeId}`);
    revalidatePath("/sponsor");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Fehler" };
  }
}

/**
 * Update the monthly cap on an active or paused pledge.
 * Pass null to remove the cap entirely.
 * monthlyCapCents must be a positive integer (in Cent) when set.
 */
export async function updatePledgeCap(
  pledgeId: string,
  monthlyCapCents: number | null
): Promise<{ error?: string }> {
  try {
    const pledge = await loadOwnedPledge(pledgeId);
    if (!pledge) return { error: "Pledge nicht gefunden oder kein Zugriff." };
    if (pledge.status === "ended") {
      return { error: "Beendete Pledges können nicht mehr geändert werden." };
    }
    if (
      monthlyCapCents !== null &&
      (!Number.isInteger(monthlyCapCents) || monthlyCapCents <= 0)
    ) {
      return { error: "Cap muss ein positiver Betrag sein." };
    }

    await db.update(pledges).set({ monthlyCapCents }).where(eq(pledges.id, pledgeId));
    revalidatePath(`/sponsor/pledge/${pledgeId}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Fehler" };
  }
}
