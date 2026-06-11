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
};

export const GRACE_PERIOD_DAYS = 7;

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
      pastDueSince: null
    };
  }

  if (sub.status === "trialing" || sub.status === "active") {
    return {
      status: sub.status,
      isReadOnly: false,
      daysUntilReadOnly: null,
      trialEndsAt: sub.trialEndsAt ?? null,
      pastDueSince: null
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
      pastDueSince: since ? new Date(since) : null
    };
  }

  if (sub.status === "cancelled") {
    return {
      status: "cancelled",
      isReadOnly: true,
      daysUntilReadOnly: null,
      trialEndsAt: null,
      pastDueSince: null
    };
  }

  if (sub.status === "paused") {
    // Pricing v2: Sommerpause für Saison-Pass — read-only, kein Past-Due.
    return {
      status: "paused",
      isReadOnly: true,
      daysUntilReadOnly: null,
      trialEndsAt: null,
      pastDueSince: null
    };
  }

  return {
    status: "incomplete",
    isReadOnly: true,
    daysUntilReadOnly: null,
    trialEndsAt: null,
    pastDueSince: null
  };
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
