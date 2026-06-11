import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, getStripeWebhookSecret, isStripeConfigured } from "@/lib/stripe/client";
import { trackServer } from "@/lib/analytics/track-server";
import { priceIdToPlanCycle } from "@/lib/stripe/pricing";
import { getBaseUrl } from "@/lib/utils/base-url";
import { enforceBasicDowngrade } from "@/lib/billing/downgrade-enforcement";
import {
  markStripeEventProcessed,
  hasStripeEventBeenProcessed,
  getSubscriptionCustomerId,
  syncSubscriptionForClub,
  setTeamLicensesPlanForSubscription,
  cancelSubscriptionForClub,
  setTeamLicensesStatusForClubTeams,
  setSubscriptionStatusByCustomer,
  getClubIdByCustomer
} from "@/lib/db/queries/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe → KickPact Webhook.
 *
 * Verarbeitet:
 * - customer.subscription.created / updated / deleted → subscription Status sync
 * - invoice.paid → Verlängerung bestätigt
 * - invoice.payment_failed → Status past_due
 *
 * Wichtig: signature-Verifikation mit STRIPE_WEBHOOK_SECRET — kein
 * unauthenticated Write in die DB.
 *
 * Audit 2026-06-11 / Phase 2 / A4 — Verlust- & Ordering-Schutz:
 * 1. Der processed-Marker wird erst NACH erfolgreichem Handling geschrieben.
 *    Vorher stand er am Anfang — ein Handler-Fehler (DB-Hickup) ließ den
 *    Event als "verarbeitet" zurück und der Stripe-Retry wurde dedupliziert
 *    → Statusänderung für immer verloren.
 * 2. customer.subscription.*-Events nehmen nicht das Event-Payload als
 *    Wahrheit, sondern fetchen die Subscription frisch von Stripe
 *    (authoritative sync) — reordered Deliveries können keinen alten Stand
 *    über einen neuen schreiben. Das macht die Handler zugleich idempotent,
 *    sodass das kleine Race-Fenster zwischen has-Check und Marker harmlos ist.
 * 3. invoice.paid reaktiviert nur, wenn die frisch gefetchte Subscription
 *    wirklich active/trialing ist.
 */
export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json({ error: "stripe-not-configured" }, { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing-signature" }, { status: 400 });
  }

  const rawBody = await req.text();
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, getStripeWebhookSecret());
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed:", err);
    return NextResponse.json({ error: "invalid-signature" }, { status: 400 });
  }

  // Dedup-Lesepfad (A4): bereits erfolgreich verarbeitete Events überspringen.
  if (await hasStripeEventBeenProcessed(event.id)) {
    console.info("[stripe-webhook] duplicate event, skipping", { eventId: event.id });
    return NextResponse.json({ received: true, deduplicated: true });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const eventSub = event.data.object as Stripe.Subscription;

        // A4: authoritative Re-Fetch — der frische Stripe-Stand gewinnt,
        // nicht das (möglicherweise reordered/stale) Event-Payload.
        const sub = await stripe.subscriptions.retrieve(eventSub.id);

        const clubId = (sub.metadata?.clubId as string) ?? null;
        if (!clubId) {
          console.warn("[stripe-webhook] subscription without clubId metadata", sub.id);
          break;
        }

        // SECURITY (M4): metadata.clubId ist im Stripe-Dashboard editierbar.
        // Bevor wir Entitlements auf den Club schreiben, validieren wir, dass
        // der Club tatsächlich zu diesem Stripe-Customer gehört. Mismatch →
        // nicht schreiben (verhindert, dass ein verstellter Metadaten-Wert ein
        // fremdes Abo auf einen anderen Club ummünzt).
        if (!(await clubMatchesCustomer(clubId, getCustomerId(sub.customer)))) {
          console.warn("[stripe-webhook] clubId/customer mismatch — ignoring", {
            subId: sub.id,
            clubId
          });
          break;
        }

        // Pricing-v2-Audit #3 (2026-05-24): plan + billing_cycle aus dem
        // gebuchten Stripe-Price reverse-mappen und in die DB spiegeln.
        const firstItem = sub.items?.data?.[0];
        const priceId =
          typeof firstItem?.price?.id === "string" ? firstItem.price.id : null;
        const planCycle = priceId ? priceIdToPlanCycle(priceId) : null;

        // Status priorisiert: pause_collection > cancel_at > Stripe-Status.
        // - pause_collection !== null heisst Sommerpause via pause-season-passes.
        // - cancel_at !== null heisst "cancelling at period end" (User hat
        //   gekündigt, läuft aber bis Period-Ende weiter).
        let resolvedStatus: ReturnType<typeof mapStripeStatus> = mapStripeStatus(sub.status);
        if (sub.pause_collection) {
          resolvedStatus = "paused";
        } else if (sub.cancel_at) {
          // Stripe-Subscription läuft bis Period-Ende, danach gekündigt.
          // Wir behalten "active", spiegeln aber pausedUntil/cancel_at.
          resolvedStatus = "active";
        }

        // pausedUntil: bei pause_collection.resumes_at oder Default null
        const pauseResumesAt =
          sub.pause_collection?.resumes_at &&
          typeof sub.pause_collection.resumes_at === "number"
            ? new Date(sub.pause_collection.resumes_at * 1000)
            : null;

        await syncSubscriptionForClub(clubId, {
          stripeSubscriptionId: sub.id,
          status: resolvedStatus,
          ...(planCycle ? { billingCycle: planCycle.cycle } : {}),
          trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
          currentPeriodEnd: extractCurrentPeriodEnd(sub),
          pausedUntil: pauseResumesAt
        });

        // Plan-Spiegelung auf team_licenses: bei Verein-Plan kann eine
        // einzige Subscription mehrere Teams decken; wir setzen den Plan auf
        // ALLE License-Rows dieser Subscription. Bei team-units (basic/pro)
        // ist's i.d.R. ohnehin nur eine Row.
        if (planCycle) {
          await setTeamLicensesPlanForSubscription(clubId, planCycle.plan);

          // Audit 2026-06-11 / Phase 2 / A7: Downgrade auf Basic stellt die
          // Basic-Caps wieder her (>5 Sponsoren pausieren, >3 Regeln
          // deaktivieren). Idempotent — läuft bei jedem Basic-Sync, ändert
          // aber nur Über-Cap-Bestände.
          if (planCycle.plan === "basic") {
            await enforceBasicDowngrade(clubId);
          }
        }

        // Conversion-Event: nur bei Erst-Erzeugung, nicht bei jedem Update
        // (sonst zählen wir Plan-Wechsel/Trial-Ende doppelt). Fire-and-forget,
        // damit Plausible-Outage niemals den Webhook scheitern lässt.
        if (event.type === "customer.subscription.created") {
          await trackServer(
            "stripe_subscription_created",
            `${getBaseUrl()}/server/subscription`,
            {
              plan: planCycle?.plan ?? "unknown",
              cycle: planCycle?.cycle ?? "unknown",
              status: mapStripeStatus(sub.status),
              clubId
            }
          );
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const clubId = (sub.metadata?.clubId as string) ?? null;
        if (!clubId) break;
        // SECURITY (M4): siehe created/updated — clubId gegen Customer prüfen.
        if (!(await clubMatchesCustomer(clubId, getCustomerId(sub.customer)))) {
          console.warn("[stripe-webhook] clubId/customer mismatch on delete — ignoring", {
            subId: sub.id,
            clubId
          });
          break;
        }
        await cancelSubscriptionForClub(clubId);
        // teamLicenses auf cancelled spiegeln.
        await setTeamLicensesStatusForClubTeams(clubId, "cancelled");
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const customerId =
          typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
        if (!customerId) break;

        // A4-Symmetrie (Review 2026-06-11): wie invoice.paid den frischen
        // Stripe-Stand nehmen. Eine nachzüglerische payment_failed-Delivery
        // nach customer.subscription.deleted setzte sonst cancelled →
        // past_due zurück — und past_due hat 7 Tage Grace, in denen die
        // Charge-Pipeline für den eigentlich gekündigten Club weiterläuft.
        const failedSubId = extractInvoiceSubscriptionId(inv);
        if (!failedSubId) {
          console.info("[stripe-webhook] payment_failed without subscription — skipping", {
            invoiceId: inv.id
          });
          break;
        }
        const failedFresh = await stripe.subscriptions.retrieve(failedSubId);
        await setSubscriptionStatusByCustomer(
          customerId,
          mapStripeStatus(failedFresh.status)
        );
        break;
      }
      case "customer.subscription.trial_will_end": {
        // Stripe sendet diesen Event 3 Tage vor Trial-Ende proaktiv.
        // Die eigentliche Reminder-Logik übernimmt der trial-reminders Inngest-Cron.
        // Wir loggen + geben 200 zurück, damit Stripe nicht endlos retried.
        const sub = event.data.object as Stripe.Subscription;
        const clubId = (sub.metadata?.clubId as string) ?? null;
        console.info("[stripe-webhook] trial_will_end", { subId: sub.id, clubId });
        break;
      }
      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        const customerId =
          typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
        if (!customerId) break;

        // A4-Guard: Reaktivierung nur, wenn die zugehörige Subscription laut
        // frischem Stripe-Fetch wirklich active/trialing ist. Vorher konnte
        // eine nachzüglerische Rest-Invoice einer GEKÜNDIGTEN Subscription
        // den Club wieder auf active setzen.
        const subId = extractInvoiceSubscriptionId(inv);
        if (!subId) {
          console.info("[stripe-webhook] invoice.paid without subscription — skipping", {
            invoiceId: inv.id
          });
          break;
        }
        const freshSub = await stripe.subscriptions.retrieve(subId);
        const freshStatus = mapStripeStatus(freshSub.status);
        if (freshStatus !== "active" && freshStatus !== "trialing") {
          console.info("[stripe-webhook] invoice.paid on non-active subscription — not reactivating", {
            invoiceId: inv.id,
            subId,
            freshStatus
          });
          break;
        }

        await setSubscriptionStatusByCustomer(customerId, freshStatus);
        if (freshStatus === "active") {
          // Auch teamLicenses auf active setzen — vorher blieb status dauerhaft
          // auf 'trialing' auch nach erfolgreichem Checkout.
          const paidClubId = await getClubIdByCustomer(customerId);
          if (paidClubId) {
            await setTeamLicensesStatusForClubTeams(paidClubId, "active");
          }
        }
        break;
      }
      default:
        // Unhandled event type — return 200 so Stripe doesn't retry forever
        break;
    }

    // A4: Marker erst NACH erfolgreichem Handling — bei einem Fehler oben
    // bleibt der Event unmarkiert und der Stripe-Retry holt ihn nach.
    await markStripeEventProcessed(event.id, event.type);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe-webhook] handler error", err);
    return NextResponse.json({ error: "handler-failure" }, { status: 500 });
  }
}

function getCustomerId(
  customer: Stripe.Subscription["customer"]
): string | null {
  if (typeof customer === "string") return customer;
  return customer?.id ?? null;
}

/**
 * Subscription-ID einer Invoice. Seit Stripe-API 2025 liegt sie unter
 * `invoice.parent.subscription_details.subscription`; ältere Payloads haben
 * sie top-level als `subscription`.
 */
function extractInvoiceSubscriptionId(inv: Stripe.Invoice): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parentSub = (inv as any).parent?.subscription_details?.subscription;
  if (typeof parentSub === "string") return parentSub;
  if (parentSub && typeof parentSub.id === "string") return parentSub.id;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legacy = (inv as any).subscription;
  if (typeof legacy === "string") return legacy;
  if (legacy && typeof legacy.id === "string") return legacy.id;
  return null;
}

/**
 * SECURITY (M4): Prüft, dass der via metadata.clubId adressierte Club zu dem
 * Stripe-Customer des Events gehört. Wenn die DB-Row keinen Customer kennt
 * (z.B. ganz frühes `created` vor Customer-Persistenz), lassen wir es zu —
 * der Metadaten-Wert stammt dann noch aus unserem eigenen Checkout. Nur ein
 * AKTIVER Widerspruch (Row-Customer ≠ Event-Customer) blockt.
 */
async function clubMatchesCustomer(
  clubId: string,
  eventCustomerId: string | null
): Promise<boolean> {
  const row = await getSubscriptionCustomerId(clubId);
  if (!row) return false; // unbekannter Club → nicht schreiben
  if (row.customerId && eventCustomerId && row.customerId !== eventCustomerId) {
    return false; // Widerspruch
  }
  return true;
}

function mapStripeStatus(
  s: Stripe.Subscription.Status
): "trialing" | "active" | "past_due" | "cancelled" | "incomplete" | "paused" {
  switch (s) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "unpaid":
      return "cancelled";
    // Pricing-v2-Audit #3 (2026-05-24): Stripe-"paused" muss auf unser
    // "paused"-Enum mappen, nicht auf "incomplete" — sonst sperrt die App
    // einen pausierten Saison-Pass-Verein fälschlich auf read-only.
    case "paused":
      return "paused";
    case "incomplete":
    default:
      return "incomplete";
  }
}

function extractCurrentPeriodEnd(sub: Stripe.Subscription): Date | null {
  // current_period_end ist seit API 2024-12-something kein Top-Level mehr.
  // Bei multi-item Subscriptions liegt es auf items.data[*].current_period_end.
  // Wir nehmen den ersten Item-Eintrag, fallback null.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const item = sub.items?.data?.[0] as any;
  if (item?.current_period_end && typeof item.current_period_end === "number") {
    return new Date(item.current_period_end * 1000);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const legacy = (sub as any).current_period_end;
  if (typeof legacy === "number") {
    return new Date(legacy * 1000);
  }
  return null;
}
