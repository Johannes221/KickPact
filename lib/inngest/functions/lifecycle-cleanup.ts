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
 *   2. end-pledges — pledges mit status='active' deren endsAt verstrichen
 *      ist → status="ended". Spec v1 §6.9. Ohne diesen Cron blieben Pledges
 *      formal active, evaluate-match filterte sie zwar via endsAt-Check raus,
 *      aber die UI zeigte sie weiterhin als aktiv → Sponsor-Verwirrung.
 */

import { and, eq, inArray, lt } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { eventApprovals, charges, pledges } from "@/lib/db/schema";

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

    if (expired.length === 0) {
      logger.info("expire-approvals: nothing to expire");
      return { expiredApprovals: 0, cancelledCharges: 0 };
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
      cancelledCharges: result.cancelled
    });
    return { expiredApprovals: expired.length, cancelledCharges: result.cancelled };
  }
);

export const endPledges = inngest.createFunction(
  { id: "end-pledges", concurrency: { limit: 1 } },
  { cron: "30 2 * * *" }, // täglich 02:30 UTC
  async ({ step, logger }) => {
    const now = new Date();

    const updated = await step.run("end-pledges", () =>
      db
        .update(pledges)
        .set({ status: "ended" })
        .where(and(eq(pledges.status, "active"), lt(pledges.endsAt, now)))
        .returning({ id: pledges.id })
    );

    logger.info("end-pledges done", { ended: updated.length });
    return { ended: updated.length };
  }
);
