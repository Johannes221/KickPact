import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { subscriptions } from "@/lib/db/schema";

export type SubscriptionGate = {
  status: "trialing" | "active" | "past_due" | "cancelled" | "incomplete" | "missing";
  isReadOnly: boolean;
  daysUntilReadOnly: number | null;
  trialEndsAt: Date | null;
  pastDueSince: Date | null;
};

const GRACE_PERIOD_DAYS = 7;

/**
 * Liefert den App-relevanten Subscription-Status für einen Club.
 *
 * - `missing`: kein Subscription-Eintrag → Trial wurde noch nicht gestartet
 * - `trialing` / `active`: alles okay, isReadOnly=false
 * - `past_due`: 7d-Grace-Period, isReadOnly=true wenn Grace überschritten
 * - `cancelled`: isReadOnly=true sofort
 *
 * Wird vom Vereins-Layout aufgerufen um einen Banner anzuzeigen und ggf.
 * Aktionen zu blockieren.
 */
export async function getSubscriptionGate(clubId: string): Promise<SubscriptionGate> {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.clubId, clubId))
    .limit(1);

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
    // Wir kennen den genauen Past-Due-Start nicht direkt, nehmen updatedAt als Proxy.
    const since = sub.updatedAt ?? sub.createdAt;
    const daysOverdue = since
      ? Math.floor((Date.now() - new Date(since).getTime()) / (1000 * 60 * 60 * 24))
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

  return {
    status: "incomplete",
    isReadOnly: true,
    daysUntilReadOnly: null,
    trialEndsAt: null,
    pastDueSince: null
  };
}
