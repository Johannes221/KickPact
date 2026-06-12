import { and, desc, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  sponsors,
  sponsorBillingCycleHistory,
  type SponsorBillingCycle
} from "@/lib/db/schema/sponsors";

/**
 * Billing-Cycle pro Sponsor (Spec 2026-05-26 §1.2).
 *
 * Der Cycle eines Beitrags wird zum SPIELZEITPUNKT bestimmt (nicht zum
 * Erzeugungs-Zeitpunkt) und als Snapshot in `charges.billingCycleSnapshot`
 * eingefroren — spätere Wechsel sortieren vergangene Beiträge nicht um.
 */

/**
 * Löst den Billing-Cycle eines Sponsors zu einem Zeitpunkt auf:
 *  1. jüngste `sponsor_billing_cycle_history`-Row mit `validFrom <= date`
 *  2. keine passende Row → `sponsors.billingCycle` (nie gewechselt =
 *     aktueller Wert gilt rückwirkend). Damit das auch nach dem ERSTEN
 *     Wechsel korrekt bleibt, schreibt {@link changeBillingCycleForSponsor}
 *     beim ersten Wechsel eine Baseline-Row (alter Cycle ab createdAt).
 *  3. Sponsor unbekannt → "monthly" (defensiv; sollte nie passieren).
 */
export async function resolveCycleAt(
  sponsorId: string,
  date: Date
): Promise<SponsorBillingCycle> {
  const [hist] = await db
    .select({ cycle: sponsorBillingCycleHistory.cycle })
    .from(sponsorBillingCycleHistory)
    .where(
      and(
        eq(sponsorBillingCycleHistory.sponsorId, sponsorId),
        lte(sponsorBillingCycleHistory.validFrom, date)
      )
    )
    .orderBy(desc(sponsorBillingCycleHistory.validFrom))
    .limit(1);
  if (hist) return hist.cycle;

  const [sp] = await db
    .select({ cycle: sponsors.billingCycle })
    .from(sponsors)
    .where(eq(sponsors.id, sponsorId))
    .limit(1);
  return sp?.cycle ?? "monthly";
}

/**
 * Löst die Cycles MEHRERER Sponsoren zum selben Zeitpunkt auf — eine
 * Map sponsorId→cycle. Performance-Vertrag der Insert-Pfade
 * (evaluate-match/addManualEvent): EIN Lookup pro Sponsor, nicht pro Proposal.
 */
export async function resolveCyclesAt(
  sponsorIds: string[],
  date: Date
): Promise<Record<string, SponsorBillingCycle>> {
  const unique = [...new Set(sponsorIds)];
  const out: Record<string, SponsorBillingCycle> = {};
  for (const id of unique) {
    out[id] = await resolveCycleAt(id, date);
  }
  return out;
}

/**
 * Wechselt den Billing-Cycle eines Sponsors: Update `sponsors.billingCycle`
 * + History-Append in EINER Transaktion. Beim ersten Wechsel wird zusätzlich
 * eine Baseline-Row (alter Cycle, validFrom = sponsor.createdAt) angelegt,
 * damit Beiträge aus der Zeit VOR dem Wechsel weiterhin den damaligen Cycle
 * auflösen. Gleicher Cycle = No-Op (keine History-Row).
 *
 * Tenancy passiert im Caller (lib/actions/billing-cycle.ts via requireUser).
 */
export async function changeBillingCycleForSponsor(
  sponsorId: string,
  cycle: SponsorBillingCycle
): Promise<{ changed: boolean }> {
  return db.transaction(async (tx) => {
    const [sp] = await tx
      .select({
        id: sponsors.id,
        billingCycle: sponsors.billingCycle,
        createdAt: sponsors.createdAt
      })
      .from(sponsors)
      .where(eq(sponsors.id, sponsorId))
      .for("update")
      .limit(1);
    if (!sp) throw new Error(`sponsor ${sponsorId} not found`);
    if (sp.billingCycle === cycle) return { changed: false };

    const [existingHistory] = await tx
      .select({ id: sponsorBillingCycleHistory.id })
      .from(sponsorBillingCycleHistory)
      .where(eq(sponsorBillingCycleHistory.sponsorId, sponsorId))
      .limit(1);
    if (!existingHistory) {
      await tx.insert(sponsorBillingCycleHistory).values({
        sponsorId,
        cycle: sp.billingCycle,
        validFrom: sp.createdAt
      });
    }

    await tx.insert(sponsorBillingCycleHistory).values({
      sponsorId,
      cycle,
      validFrom: new Date()
    });
    await tx
      .update(sponsors)
      .set({ billingCycle: cycle })
      .where(eq(sponsors.id, sponsorId));

    return { changed: true };
  });
}
