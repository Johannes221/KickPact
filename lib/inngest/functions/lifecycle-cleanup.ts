/**
 * Tägliche Lifecycle-Cleanups (Audit 2026-05-24 Phase 3 / Task 3.4).
 *
 * Zwei Crons in einer Datei, weil sie thematisch zusammengehören:
 *
 *   1. expire-approvals — pending event_approvals deren expiresAt verstrichen
 *      ist → status="expired". Zugehörige pending_approval Charges → cancelled.
 *      Ohne diesen Cron blieben Approvals (und damit Charges) forever pending,
 *      der Sponsor bekam ewig Reminder-Mails, der Cap-Check zählte die
 *      pending-charges in den Monatscap rein.
 *
 *   2. end-pledges — pledges (active ODER paused) deren endsAt verstrichen
 *      ist → status="ended". Spec v1 §6.9. Ohne diesen Cron blieben Pledges
 *      formal active, evaluate-match filterte sie zwar via endsAt-Check raus,
 *      aber die UI zeigte sie weiterhin als aktiv → Sponsor-Verwirrung.
 *      (Audit 2026-06-11: paused-Pledges wurden nie beendet → ewig "Pausiert".)
 */

import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { eventApprovals, charges } from "@/lib/db/schema";
import { endExpiredPledges } from "@/lib/db/queries/pledges";
import { deleteExpiredSystemRows } from "@/lib/db/queries/system-retention";

/**
 * C2 (Audit 2026-06-11): Direkte Charges (ohne matchEvent — Saison-Charges
 * wie season_custom, Outcome-Charges mit manueller Evidenz) haben keine
 * eventApprovals-Row mit expiresAt. Für sie gilt eine feste Frist: nach
 * 21 Tagen pending wird storniert (Analogon zum Approval-Expiry).
 */
export const DIRECT_CHARGE_APPROVAL_DAYS = 21;

export const expireApprovals = inngest.createFunction(
  { id: "expire-approvals", concurrency: { limit: 1 } },
  { cron: "15 2 * * *" }, // täglich 02:15 UTC (vor pause-/resume-Crons)
  async ({ step, logger }) => {
    const now = new Date();

    // Finde alle pending Approvals, deren expiresAt vorbei ist.
    const expired = await step.run("find-expired", () =>
      db
        .select({
          id: eventApprovals.id,
          matchEventId: eventApprovals.matchEventId,
          pledgeRuleId: eventApprovals.pledgeRuleId
        })
        .from(eventApprovals)
        .where(
          and(
            eq(eventApprovals.status, "pending"),
            lt(eventApprovals.expiresAt, now)
          )
        )
    );

    // C2: Direkte Charges (matchEventId NULL) ohne Approval-Row — nach
    // 21 Tagen pending stornieren. Läuft unabhängig vom Event-Approval-Teil.
    const directCutoff = new Date(
      now.getTime() - DIRECT_CHARGE_APPROVAL_DAYS * 24 * 60 * 60 * 1000
    );
    const expiredDirect = await step.run("expire-direct-charges", () =>
      db
        .update(charges)
        .set({
          status: "cancelled",
          cancelledReason: "approval_expired",
          cancelledAt: now
        })
        .where(
          and(
            eq(charges.status, "pending_approval"),
            isNull(charges.matchEventId),
            lt(charges.createdAt, directCutoff)
          )
        )
        .returning({ id: charges.id })
    );

    // Retention (Vibe-Check 2026-07-06): processed_stripe_events +
    // sent_notifications wachsen sonst unbegrenzt. Muss VOR dem
    // nothing-to-expire-Early-Return laufen.
    const retention = await step.run("delete-expired-system-rows", () =>
      deleteExpiredSystemRows(now)
    );

    if (expired.length === 0) {
      logger.info("expire-approvals: nothing to expire", {
        cancelledDirectCharges: expiredDirect.length,
        retention
      });
      return {
        expiredApprovals: 0,
        cancelledCharges: 0,
        cancelledDirectCharges: expiredDirect.length
      };
    }

    const result = await step.run("expire-and-cancel", async () => {
      return await db.transaction(async (tx) => {
        const ids = expired.map((e) => e.id);
        await tx
          .update(eventApprovals)
          .set({ status: "expired", respondedAt: now })
          .where(inArray(eventApprovals.id, ids));

        // Zugehörige pending_approval-Charges cancellen
        const eventIds = expired.map((e) => e.matchEventId).filter((id): id is string => id !== null);
        const ruleIds = expired.map((e) => e.pledgeRuleId);
        if (eventIds.length === 0) {
          return { cancelled: 0 };
        }
        const cancelledRows = await tx
          .update(charges)
          .set({ status: "cancelled", cancelledReason: "approval_expired" })
          .where(
            and(
              inArray(charges.matchEventId, eventIds),
              inArray(charges.pledgeRuleId, ruleIds),
              eq(charges.status, "pending_approval")
            )
          )
          .returning({ id: charges.id });
        return { cancelled: cancelledRows.length };
      });
    });

    logger.info("expire-approvals done", {
      expiredApprovals: expired.length,
      cancelledCharges: result.cancelled,
      cancelledDirectCharges: expiredDirect.length,
      retention
    });
    return {
      expiredApprovals: expired.length,
      cancelledCharges: result.cancelled,
      cancelledDirectCharges: expiredDirect.length
    };
  }
);

export const endPledges = inngest.createFunction(
  { id: "end-pledges", concurrency: { limit: 1 } },
  { cron: "30 2 * * *" }, // täglich 02:30 UTC
  async ({ step, logger }) => {
    const now = new Date();

    const updated = await step.run("end-pledges", () => endExpiredPledges(now));

    logger.info("end-pledges done", { ended: updated.length });
    return { ended: updated.length };
  }
);
