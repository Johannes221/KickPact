import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { subscriptions } from "@/lib/db/schema";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "cancelled"
  | "incomplete"
  // Pricing v2: Saison-Pass in Sommerpause (Jun/Jul).
  | "paused";

export type SubscriptionGate = {
  status: SubscriptionStatus | "missing";
  isReadOnly: boolean;
  daysUntilReadOnly: number | null;
  trialEndsAt: Date | null;
  pastDueSince: Date | null;
  /**
   * Phase 3 / R6: "trial_expired" = der Trial ist abgelaufen und es wurde NIE
   * eine Stripe-Subscription gestartet (unlizenzierter Verein). Gesetzt sowohl
   * für status=cancelled (expire-trials-Cron lief schon) als auch für
   * status=trialing mit trialEndsAt in der Vergangenheit (Cron lief noch
   * nicht). Crawling läuft für solche Clubs weiter (App bleibt lebendig,
   * Conversion möglich), aber es entstehen keine neuen Charges.
   */
  reason: "trial_expired" | null;
};

/**
 * Minimaler Row-Shape, der vom Mapper gebraucht wird. So bleibt
 * `gateFromSubscription` von der konkreten Drizzle-Tabellen-Typ-Definition
 * entkoppelt und damit testbar.
 */
export type SubscriptionRowForGate = {
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
  /**
   * Audit 2026-06-11 / A5: expliziter past_due-Anker. Optional, damit ältere
   * Aufrufer/Tests ohne die Spalte weiter funktionieren — dann greift der
   * updatedAt-Proxy (mit dessen bekanntem Reset-Problem).
   */
  pastDueSince?: Date | null;
  /**
   * Phase 3 / R6: unterscheidet echte Kündigung (Stripe-Sub existierte) vom
   * nie bezahlten, abgelaufenen Trial. Optional für ältere Aufrufer/Tests —
   * dann wird kein trial_expired-Reason abgeleitet.
   */
  stripeSubscriptionId?: string | null;
  /**
   * Apple-IAP: stabiler Abo-Identifier. Apple-Zahler haben NIE eine
   * stripeSubscriptionId, behalten aber ihr Onboarding-trialEndsAt — ein
   * gesetzter Wert zählt daher (wie stripeSubscriptionId) als "hat bezahlt".
   * Optional für ältere Aufrufer/Tests.
   */
  appleOriginalTransactionId?: string | null;
};

export const GRACE_PERIOD_DAYS = 7;

/** True, wenn der Trial abgelaufen ist und nie eine Stripe-Sub gestartet wurde. */
function isTrialExpiredNeverPaid(sub: SubscriptionRowForGate, now: Date): boolean {
  if (sub.stripeSubscriptionId || sub.appleOriginalTransactionId) return false;
  return !!sub.trialEndsAt && new Date(sub.trialEndsAt).getTime() < now.getTime();
}

/**
 * Pure-Function-Variante des Gates: erhält einen (gemockt-baren) Subscription-Row
 * und liefert das Gate. Wird von `getSubscriptionGate` benutzt + ist in Tests
 * isoliert prüfbar (kein DB-Hit).
 *
 * @param sub  Subscription-Row oder null wenn nicht vorhanden
 * @param now  injizierbare "now" für deterministische Tests (defaults to Date.now)
 */
export function gateFromSubscription(
  sub: SubscriptionRowForGate | null,
  now: Date = new Date()
): SubscriptionGate {
  if (!sub) {
    return {
      status: "missing",
      isReadOnly: false,
      daysUntilReadOnly: null,
      trialEndsAt: null,
      pastDueSince: null,
      reason: null
    };
  }

  if (sub.status === "trialing" || sub.status === "active") {
    // trialing mit abgelaufenem trialEndsAt + nie bezahlt: das Fenster zwischen
    // Trial-Ablauf und dem täglichen expire-trials-Cron. isReadOnly bleibt
    // false (UI-Verhalten unverändert), aber Geld-Pfade lesen den Reason.
    const trialExpired =
      sub.status === "trialing" && isTrialExpiredNeverPaid(sub, now);
    return {
      status: sub.status,
      isReadOnly: false,
      daysUntilReadOnly: null,
      trialEndsAt: sub.trialEndsAt ?? null,
      pastDueSince: null,
      reason: trialExpired ? "trial_expired" : null
    };
  }

  if (sub.status === "past_due") {
    // A5: pastDueSince ist der deterministische Anker (wird beim Status-
    // wechsel → past_due gesetzt und von Folge-Syncs NICHT verschoben).
    // Fallback updatedAt nur für Alt-Rows, die vor Migration 0054 in
    // past_due gingen.
    const since = sub.pastDueSince ?? sub.updatedAt ?? sub.createdAt;
    const daysOverdue = since
      ? Math.floor((now.getTime() - new Date(since).getTime()) / (1000 * 60 * 60 * 24))
      : 0;
    const isReadOnly = daysOverdue > GRACE_PERIOD_DAYS;
    return {
      status: "past_due",
      isReadOnly,
      daysUntilReadOnly: isReadOnly ? null : GRACE_PERIOD_DAYS - daysOverdue,
      trialEndsAt: null,
      pastDueSince: since ? new Date(since) : null,
      reason: null
    };
  }

  if (sub.status === "cancelled") {
    // cancelled OHNE Stripe-Sub = expire-trials hat einen nie bezahlten Trial
    // beendet (echte Kündigungen behalten ihre stripeSubscriptionId).
    return {
      status: "cancelled",
      isReadOnly: true,
      daysUntilReadOnly: null,
      trialEndsAt: null,
      pastDueSince: null,
      reason:
        !sub.stripeSubscriptionId &&
        !sub.appleOriginalTransactionId &&
        sub.trialEndsAt
          ? "trial_expired"
          : null
    };
  }

  if (sub.status === "paused") {
    // Pricing v2: Sommerpause für Saison-Pass — read-only, kein Past-Due.
    return {
      status: "paused",
      isReadOnly: true,
      daysUntilReadOnly: null,
      trialEndsAt: null,
      pastDueSince: null,
      reason: null
    };
  }

  return {
    status: "incomplete",
    isReadOnly: true,
    daysUntilReadOnly: null,
    trialEndsAt: null,
    pastDueSince: null,
    reason: null
  };
}

/**
 * Phase 3 / R6 — Crawl-Gate: NUR echt gekündigte Clubs werden nicht mehr
 * gecrawlt. trial_expired (unlizenziert, aber konvertierbar), paused
 * (Sommerpause) und past_due (Grace/Mahnlauf) crawlen weiter — die App
 * bleibt lebendig, Charges blockt `isChargeBlockedByGate` separat.
 */
// Schmaler Strukturtyp: Inngest-step.run JSONifiziert Dates zu Strings —
// die Gate-Entscheidungen brauchen nur die stabilen Felder.
export type SubscriptionGateDecisionInput = Pick<
  SubscriptionGate,
  "status" | "isReadOnly" | "reason"
>;

export function isCrawlBlockedByGate(
  gate: SubscriptionGateDecisionInput
): boolean {
  return gate.status === "cancelled" && gate.reason !== "trial_expired";
}

/**
 * Phase 3 / R6 — Geld-Gate für evaluate-match: past_due (jenseits Grace) und
 * cancelled blocken wie in Phase 2 (B3); ZUSÄTZLICH blockt ein abgelaufener,
 * nie bezahlter Trial (auch wenn der Status noch trialing ist, weil der
 * expire-trials-Cron noch nicht lief). paused chargt weiter (Saison bis 30.6.).
 */
export function isChargeBlockedByGate(
  gate: SubscriptionGateDecisionInput
): boolean {
  if (gate.reason === "trial_expired") return true;
  // Review M3 (2026-06-11): "incomplete" = Re-Onboarder ohne Trial-Anspruch,
  // der nie ausgecheckt hat — nie lizenziert, also keine neuen Beiträge.
  // (Gecrawlt wird er weiter: konvertierbar, App bleibt lebendig.)
  if (gate.status === "incomplete") return true;
  return (
    gate.isReadOnly && (gate.status === "past_due" || gate.status === "cancelled")
  );
}

/**
 * Liefert den App-relevanten Subscription-Status für einen Club.
 *
 * - `missing`: kein Subscription-Eintrag → Trial wurde noch nicht gestartet
 * - `trialing` / `active`: alles okay, isReadOnly=false
 * - `past_due`: 7d-Grace-Period, isReadOnly=true wenn Grace überschritten
 * - `cancelled`: isReadOnly=true sofort
 *
 * Wird vom Vereins-Layout aufgerufen um einen Banner anzuzeigen und ggf.
 * Aktionen zu blockieren (siehe `assertClubWriteAccess`).
 */
export async function getSubscriptionGate(clubId: string): Promise<SubscriptionGate> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.clubId, clubId))
    .limit(1);

  return gateFromSubscription(sub ?? null);
}
