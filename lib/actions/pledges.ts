"use server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pledges, sponsors } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";

export async function setPledgeStatus(
  pledgeId: string,
  newStatus: "active" | "paused" | "ended"
): Promise<{ error?: string }> {
  try {
    const user = await requireUser();

    // Tenant-Check: Pledge gehört diesem User?
    const [pledge] = await db
      .select({ id: pledges.id, status: pledges.status, sponsorUserId: sponsors.userId })
      .from(pledges)
      .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
      .where(eq(pledges.id, pledgeId))
      .limit(1);

    if (!pledge || pledge.sponsorUserId !== user.id) {
      return { error: "Pledge nicht gefunden oder kein Zugriff." };
    }

    if (pledge.status === "ended") {
      return { error: "Beendete Pledges können nicht mehr geändert werden." };
    }

    // Audit 2026-05-24 Phase 3 / Task 3.6: Sponsor darf Pledge endgültig
    // beenden. Vorher gab es nur active|paused — kein User-initiiertes
    // ended, der Sponsor war zum Pausieren oder zum Auslaufen am Saisonende
    // gezwungen. ended ist irreversibel (siehe ended-Check oben).
    await db.update(pledges)
      .set({ status: newStatus })
      .where(eq(pledges.id, pledgeId));

    revalidatePath(`/sponsor/pledge/${pledgeId}`);
    revalidatePath("/sponsor");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Fehler" };
  }
}
