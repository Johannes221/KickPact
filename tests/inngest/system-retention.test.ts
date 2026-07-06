/**
 * Retention für System-Tabellen (Vibe-Check 2026-07-06 / N1).
 *
 * processed_stripe_events (Webhook-Idempotenz) und sent_notifications
 * (Mail-Dedupe) wuchsen unbegrenzt. Der expire-approvals-Cron
 * (lifecycle-cleanup) löscht jetzt Rows älter als 90 Tage.
 *
 * 90 Tage sind sicher: Stripe retryt Events max. ~3 Tage; alle
 * sent_notifications-Keys sind zeit-/saisonsgebunden (Reminder-Fenster,
 * Approval-Expiry 21d, Match-Push direkt nach Spiel) — kein Send-Fenster
 * reicht 90 Tage zurück, also keine Re-Send-Gefahr.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { processedStripeEvents, sentNotifications } from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import { expireApprovals } from "@/lib/inngest/functions/lifecycle-cleanup";

async function runExpireApprovals() {
  const fn = (expireApprovals as unknown as {
    fn: (ctx: {
      step: { run: <T>(l: string, f: () => Promise<T> | T) => Promise<T> };
      logger: {
        info: ReturnType<typeof vi.fn>;
        warn: ReturnType<typeof vi.fn>;
        error: ReturnType<typeof vi.fn>;
      };
    }) => Promise<unknown>;
  }).fn;
  return fn({
    step: { run: async (_l, f) => f() },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  });
}

describe.skipIf(isIntegrationDbDisabled)("System-Tabellen-Retention (N1)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("löscht Rows älter als 90 Tage, behält jüngere", async () => {
    const db = await getTestDb();
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const fresh = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    await db.insert(processedStripeEvents).values([
      { eventId: "evt_old", eventType: "customer.subscription.updated", processedAt: old },
      { eventId: "evt_new", eventType: "customer.subscription.updated", processedAt: fresh }
    ]);
    await db.insert(sentNotifications).values([
      { kind: "season-renewal", key: "p_old:2526:30", sentAt: old },
      { kind: "season-renewal", key: "p_new:2627:30", sentAt: fresh }
    ]);

    await runExpireApprovals();

    const evts = await db.select().from(processedStripeEvents);
    expect(evts.map((e) => e.eventId)).toEqual(["evt_new"]);
    const notes = await db.select().from(sentNotifications);
    expect(notes.map((n) => n.key)).toEqual(["p_new:2627:30"]);
  });
});
