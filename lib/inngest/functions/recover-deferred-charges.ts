import { inngest } from "@/lib/inngest/client";
import { getRecentFinishedMatchesForClubLicense } from "@/lib/db/queries/matches";

/**
 * Fenster (Tage) für die Deferred-Charge-Recovery. Nur Spiele der letzten N
 * Tage werden nach einer Reaktivierung neu ausgewertet — ein ganzer Rückstau
 * würde sonst auf den Monats-Cap des Reaktivierungs-Monats einschlagen
 * (Cap-Crush, der Cap-Anker ist confirmedAt = jetzt). Ältere zurückgestellte
 * Charges verfallen bewusst.
 *
 * 35d ≈ ein Monats-Cap-Zyklus + üblicher Stripe-Mahnlauf (Dunning), deckt also
 * den realistischen past_due-Lapse ab, ohne alte Rechnungsmonate aufzurollen.
 */
export const DEFERRED_CHARGE_RECOVERY_DAYS = 35;

/**
 * Stellt Charges wieder her, die während eines past_due-Read-Only-Lapse
 * zurückgestellt wurden (match/evaluation-deferred), sobald der Verein wieder
 * zahlt. Getriggert vom Stripe-Webhook (invoice.paid, Übergang past_due→active).
 *
 * Warum ein eigener Pfad statt „erneut einlesen": crawl-matches überspringt
 * bereits persistierte Spiele bei unverändertem contentHash und emittet KEIN
 * match/finished — der dokumentierte Re-Scrape war für den past_due-Pfad ein
 * No-Op und die deferred Charges gingen still verloren (anders als cancelled,
 * wo Spiele erst bei Reaktivierung frisch inserted werden).
 *
 * Re-Emit ist gefahrlos: evaluate-match ist idempotent (Unique-Constraint auf
 * charges → Kollision = skip), bereits fakturierte Spiele erzeugen also keine
 * Doppel-Charge. Das Geld-Gate von evaluate-match schützt weiterhin — läuft die
 * Recovery fälschlich für einen noch gesperrten Verein, entstehen keine Charges.
 */
export const recoverDeferredCharges = inngest.createFunction(
  { id: "recover-deferred-charges", concurrency: { limit: 2 } },
  { event: "billing/charges.recover" },
  async ({ event, step, logger }) => {
    const { clubId } = event.data as { clubId: string };
    const since = new Date(
      Date.now() - DEFERRED_CHARGE_RECOVERY_DAYS * 24 * 60 * 60 * 1000
    );

    const recent = await step.run("load-recent-finished-matches", () =>
      getRecentFinishedMatchesForClubLicense(clubId, since)
    );

    logger.info("recover-deferred-charges: re-emitting match/finished", {
      clubId,
      count: recent.length,
      sinceDays: DEFERRED_CHARGE_RECOVERY_DAYS
    });

    for (const m of recent) {
      await step.sendEvent(`recover-${m.matchId}`, {
        name: "match/finished",
        data: { matchId: m.matchId, teamId: m.teamId, recovered: true }
      });
    }

    return { clubId, reEmitted: recent.length };
  }
);
