"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { sponsors, type SponsorBillingCycle } from "@/lib/db/schema/sponsors";
import { changeBillingCycleForSponsor } from "@/lib/db/queries/billing-cycle";

const cycleSchema = z.enum(["monthly", "season_end"]);

export type ChangeBillingCycleResult =
  | { ok: true; cycle: SponsorBillingCycle }
  | { ok: false; message: string };

/**
 * Wechselt den Abrechnungs-Rhythmus des eingeloggten Sponsors
 * (Spec 2026-05-26 §1.2 — Wechsel jederzeit erlaubt).
 *
 * Tenancy: der Sponsor wird über `sponsors.userId = session.user.id`
 * aufgelöst — niemand kann fremde Sponsor-Profile umstellen.
 */
export async function changeBillingCycle(
  cycle: SponsorBillingCycle
): Promise<ChangeBillingCycleResult> {
  const user = await requireUser();

  const parsed = cycleSchema.safeParse(cycle);
  if (!parsed.success) {
    return { ok: false, message: "Ungültiger Abrechnungs-Rhythmus." };
  }

  const [sponsor] = await db
    .select({ id: sponsors.id })
    .from(sponsors)
    .where(eq(sponsors.userId, user.id))
    .limit(1);
  if (!sponsor) {
    return { ok: false, message: "Kein Sponsor-Profil gefunden." };
  }

  await changeBillingCycleForSponsor(sponsor.id, parsed.data);

  revalidatePath("/sponsor/profil");
  revalidatePath("/sponsor");

  return { ok: true, cycle: parsed.data };
}
