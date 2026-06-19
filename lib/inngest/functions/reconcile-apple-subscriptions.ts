/**
 * HIGH-2 — Reconciliation-Cron gegen verlorene Apple-Notifications.
 *
 * Der Apple-Abo-Lifecycle hängt heute zu 100 % an zugestellten App Store Server
 * Notifications. Apple garantiert KEINE Zustellung (Endpoint-Downtime,
 * Sandbox/Prod-URL-Fehlkonfig, schlicht verloren). Geht eine EXPIRED- oder
 * GRACE_PERIOD_EXPIRED-Notification verloren, bleibt der Verein für immer
 * `active` mit Gratis-Zugang. Stripe hat ein autoritatives Re-Fetch-
 * Sicherheitsnetz; dieser Cron baut das Pendant für Apple.
 *
 * Täglich 03:30 UTC: alle aktiven/past_due Apple-Abos, deren appleExpiresAt
 * abgelaufen oder unbekannt ist, werden direkt gegen die App Store Server API
 * (getAllSubscriptionStatuses) revalidiert. Sagt Apple "cancelled", während
 * unsere DB noch active/past_due hält, korrigieren wir Status + Team-Lizenzen.
 *
 * Web-inert: ohne ASC-API-Credentials (isAppleApiConfigured()=false) returned
 * der Cron früh und ist damit harmlos, bis die Secrets in Coolify gesetzt sind.
 */

import { inngest } from "@/lib/inngest/client";
import {
  isAppleApiConfigured,
  getSubscriptionStatus
} from "@/lib/apple/api-client";
import {
  listAppleSubscriptionsForReconcile,
  setAppleStatusForClub,
  setTeamLicensesStatusForClubTeams
} from "@/lib/db/queries/subscriptions";

export const reconcileAppleSubscriptions = inngest.createFunction(
  { id: "reconcile-apple-subscriptions", concurrency: { limit: 1 } },
  { cron: "30 3 * * *" }, // täglich 03:30 UTC
  async ({ step, logger }) => {
    if (!isAppleApiConfigured()) {
      logger.info("reconcile-apple-subscriptions: Apple API nicht konfiguriert");
      return { skipped: "apple-api-not-configured" } as const;
    }

    const now = new Date();
    const subs = await step.run("find-apple-subs-to-reconcile", () =>
      listAppleSubscriptionsForReconcile(now)
    );

    if (subs.length === 0) {
      logger.info("reconcile-apple-subscriptions: nichts zu prüfen");
      return { checked: 0, cancelled: 0 };
    }

    let cancelled = 0;
    for (const sub of subs) {
      const result = await step.run(`reconcile-${sub.clubId}`, async () => {
        const apple = await getSubscriptionStatus(sub.originalTransactionId);

        if (apple.status === "unknown") {
          logger.warn("reconcile-apple-subscriptions: unknown status, skip", {
            clubId: sub.clubId
          });
          return { cancelled: false };
        }

        if (apple.status === "cancelled") {
          // Verlorene EXPIRED/REVOKED-Notification: Status korrigieren +
          // Team-Lizenzen schließen.
          await setAppleStatusForClub(sub.clubId, "cancelled", apple.expiresAt);
          await setTeamLicensesStatusForClubTeams(sub.clubId, "cancelled");
          logger.info("reconcile-apple-subscriptions: cancelled", {
            clubId: sub.clubId
          });
          return { cancelled: true };
        }

        // active/past_due: appleExpiresAt best-effort auffrischen, damit das Abo
        // nicht jeden Tag erneut geprüft wird (cutoff=now → far-future fällt raus).
        await setAppleStatusForClub(sub.clubId, apple.status, apple.expiresAt);
        return { cancelled: false };
      });

      if (result.cancelled) cancelled += 1;
    }

    logger.info("reconcile-apple-subscriptions done", {
      checked: subs.length,
      cancelled
    });
    return { checked: subs.length, cancelled };
  }
);
