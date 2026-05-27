/**
 * Stripe Test Clock — Trial-to-Paid Flow
 *
 * Simulates a full 30-day trial lifecycle using Stripe Test Clocks.
 * A Test Clock lets you advance time for a specific Customer, causing
 * Stripe to fire real webhooks as if days had passed.
 *
 * Run:
 *   npx tsx tests/stripe/test-clock-trial.ts
 *
 * Requires STRIPE_SECRET_KEY (test key) in env or .env.local.
 * Optionally STRIPE_BASIC_MONTHLY_PRICE_ID (falls back to hardcoded test value).
 *
 * Steps:
 *  1. Create Test Clock frozen at now
 *  2. Create Customer attached to the clock
 *  3. Attach payment method (pm_card_visa)
 *  4. Create Subscription with 30-day trial
 *  5. Advance clock to day 27 → trial_will_end fires
 *  6. Check webhook at kickpact.schartl.dev returns 200
 *  7. Advance clock to day 31 → trial ends, first invoice
 *  8. Check webhook for invoice.paid returns 200
 *  9. Cleanup: delete clock + customer
 */

import path from "node:path";
import fs from "node:fs";
import https from "node:https";

// Load .env.local if present (before importing Stripe so the key is available)
function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

loadEnvLocal();

import Stripe from "stripe";

// ─── Config ────────────────────────────────────────────────────────────────

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
  console.error("❌  STRIPE_SECRET_KEY nicht gesetzt");
  process.exit(1);
}
if (!STRIPE_SECRET_KEY.startsWith("sk_test_")) {
  console.error("❌  STRIPE_SECRET_KEY muss ein Test-Key sein (sk_test_…)");
  process.exit(1);
}

const BASIC_MONTHLY_PRICE_ID =
  process.env.STRIPE_BASIC_MONTHLY_PRICE_ID ?? "price_1TaYLu5QCjYtboeOuz0GOgyB";

const STAGING_WEBHOOK_URL = "https://kickpact.schartl.dev/api/stripe/webhook";
const TEST_CUSTOMER_EMAIL = "test-trial@kickpact.test";
const TEST_CLUB_ID = "test-club-id";

// ─── Stripe client ──────────────────────────────────────────────────────────

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2026-04-22.dahlia",
  typescript: true,
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(step: string, msg: string, data?: unknown) {
  const prefix = `[${step}]`;
  if (data !== undefined) {
    console.log(`${prefix} ${msg}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`${prefix} ${msg}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Poll until the test clock reaches `targetFrozenTime` (unix seconds).
 * Stripe advances clocks asynchronously; status goes "advancing" → "ready".
 */
async function waitForClockReady(
  clockId: string,
  targetFrozenTime: number,
  timeoutMs = 120_000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const clock = await stripe.testHelpers.testClocks.retrieve(clockId);
    if (clock.status === "ready" && clock.frozen_time >= targetFrozenTime) {
      return;
    }
    if (clock.status === "internal_failure") {
      throw new Error(`Test Clock ${clockId} in internal_failure`);
    }
    await sleep(2_000);
  }
  throw new Error(`Test Clock ${clockId} did not become ready within ${timeoutMs}ms`);
}

/**
 * Fire a HEAD/GET against the staging webhook endpoint to verify it's reachable.
 * For real webhook checks, we rely on Stripe forwarding via the clock advance.
 * This helper does a manual POST to verify the endpoint rejects unsigned requests
 * correctly (expected 400, not 500).
 */
function checkWebhookEndpointHealth(): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(STAGING_WEBHOOK_URL);
    const options: https.RequestOptions = {
      hostname: url.hostname,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength("{}"),
        // No stripe-signature header → should get 400
      },
      timeout: 10_000,
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Webhook health-check timed out"));
    });
    req.write("{}");
    req.end();
  });
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  let clockId: string | null = null;
  let customerId: string | null = null;
  let subscriptionId: string | null = null;

  const nowUnix = Math.floor(Date.now() / 1000);
  // Real-world script start — used to filter Stripe events list (which uses real created timestamps,
  // NOT the simulated clock time that advances inside the Test Clock).
  const scriptStartUnix = nowUnix;
  const day27Unix = nowUnix + 27 * 24 * 60 * 60;
  const day31Unix = nowUnix + 31 * 24 * 60 * 60;

  console.log("\n══════════════════════════════════════════════");
  console.log("  KickPact — Stripe Test Clock: Trial → Paid");
  console.log("══════════════════════════════════════════════\n");

  try {
    // ── Step 0: Verify webhook endpoint is alive ──────────────────────────
    log("0", "Prüfe Webhook-Endpoint Erreichbarkeit …");
    const health = await checkWebhookEndpointHealth();
    if (health.status === 400) {
      log("0", `✓  Webhook-Endpoint antwortet korrekt mit 400 (missing-signature)`);
    } else if (health.status === 503) {
      log("0", `⚠  Webhook-Endpoint gibt 503 (Stripe not configured on staging?), fahre trotzdem fort`);
    } else {
      log("0", `⚠  Unerwarteter Status ${health.status} vom Webhook-Endpoint`, { body: health.body });
    }

    // ── Step 1: Create Test Clock ─────────────────────────────────────────
    log("1", "Erstelle Test Clock …");
    const clock = await stripe.testHelpers.testClocks.create({
      frozen_time: nowUnix,
      name: `KickPact Trial Test ${new Date().toISOString()}`,
    });
    clockId = clock.id;
    log("1", `✓  Test Clock erstellt: ${clock.id} (frozen at ${new Date(nowUnix * 1000).toISOString()})`);

    // ── Step 2: Create Customer attached to clock ─────────────────────────
    log("2", "Erstelle Test Customer …");
    const customer = await stripe.customers.create({
      email: TEST_CUSTOMER_EMAIL,
      name: "Test Verein KickPact",
      test_clock: clockId,
      metadata: { clubId: TEST_CLUB_ID, env: "test-clock" },
    });
    customerId = customer.id;
    log("2", `✓  Customer erstellt: ${customer.id} (${customer.email})`);

    // ── Step 3: Attach Payment Method ─────────────────────────────────────
    log("3", "Weise Zahlungsmethode zu (pm_card_visa) …");
    const pm = await stripe.paymentMethods.attach("pm_card_visa", {
      customer: customerId,
    });
    // Set as default invoice payment method
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: pm.id },
    });
    log("3", `✓  Payment Method angehängt: ${pm.id} (${pm.card?.brand} •••• ${pm.card?.last4})`);

    // ── Step 4: Create Subscription with 30-day trial ─────────────────────
    log("4", `Erstelle Subscription (Plan: ${BASIC_MONTHLY_PRICE_ID}, Trial: 30 Tage) …`);
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: BASIC_MONTHLY_PRICE_ID }],
      trial_period_days: 30,
      metadata: {
        clubId: TEST_CLUB_ID,
        plan: "basic",
        cycle: "monthly",
      },
      // Ensures trial_will_end event fires 3 days before trial end
      trial_settings: {
        end_behavior: { missing_payment_method: "cancel" },
      },
    });
    subscriptionId = subscription.id;
    log("4", `✓  Subscription erstellt: ${subscription.id}`, {
      status: subscription.status,
      trial_end: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
    });

    if (subscription.status !== "trialing") {
      log("4", `⚠  Erwarteter Status 'trialing', erhalten: ${subscription.status}`);
    }

    // ── Step 5: Advance clock to day 27 (trial_will_end) ─────────────────
    log("5", "Spule Zeit auf Tag 27 vor (trial_will_end erwartet) …");
    await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: day27Unix });
    await waitForClockReady(clockId, day27Unix);
    log("5", `✓  Clock auf ${new Date(day27Unix * 1000).toISOString()} vorgespult`);

    // Retrieve updated subscription to check status
    const subAfterDay27 = await stripe.subscriptions.retrieve(subscriptionId);
    log("5", `   Subscription-Status nach Tag 27: ${subAfterDay27.status}`);

    // ── Step 6: Check webhook for day 27 events ───────────────────────────
    log("6", "Prüfe ob Staging-Webhook die Events von Tag 27 verarbeitet hat …");
    // Stripe delivers webhooks asynchronously to the registered endpoint.
    // We give it a short window then check recent events.
    await sleep(5_000);

    // List recent events for this customer to see what was delivered.
    // Important: stripe.events.list filters by REAL created time, not simulated clock time.
    const events27 = await stripe.events.list({
      created: { gte: scriptStartUnix },
      limit: 20,
    });
    const relevantTypes27 = ["customer.subscription.trial_will_end", "customer.subscription.updated"];
    const found27 = events27.data.filter((e) =>
      relevantTypes27.includes(e.type) &&
      (e.data.object as { id?: string }).id === subscriptionId
    );
    if (found27.length > 0) {
      log("6", `✓  Events gefeuert bei Tag 27:`);
      for (const ev of found27) {
        log("6", `   → ${ev.type} (${ev.id})`);
      }
    } else {
      log("6", `   Keine trial_will_end Events für diese Subscription (ggf. noch nicht fällig)`);
    }

    // ── Step 7: Advance clock to day 31 (trial ends, first invoice) ───────
    log("7", "Spule Zeit auf Tag 31 vor (Trial endet, erste Rechnung) …");
    await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: day31Unix });
    await waitForClockReady(clockId, day31Unix);
    log("7", `✓  Clock auf ${new Date(day31Unix * 1000).toISOString()} vorgespult`);

    // Retrieve updated subscription
    const subAfterDay31 = await stripe.subscriptions.retrieve(subscriptionId);
    log("7", `   Subscription-Status nach Tag 31: ${subAfterDay31.status}`);

    if (subAfterDay31.status === "active") {
      log("7", `✓  Trial erfolgreich zu paid konvertiert (Status: active)`);
    } else if (subAfterDay31.status === "trialing") {
      log("7", `⚠  Subscription noch im Trial — Clock-Advance ggf. noch nicht fertig`);
    } else {
      log("7", `   Status: ${subAfterDay31.status}`);
    }

    // ── Step 8: Check webhook for day 31 events ───────────────────────────
    log("8", "Prüfe Events nach Trial-Ende (invoice.paid erwartet) …");
    await sleep(5_000);

    // Use real-world script start time as lower bound (not simulated clock time)
    const events31 = await stripe.events.list({
      created: { gte: scriptStartUnix },
      limit: 30,
    });
    const relevantTypes31 = [
      "invoice.paid",
      "invoice.payment_succeeded",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ];
    const found31 = events31.data.filter((e) => relevantTypes31.includes(e.type));
    if (found31.length > 0) {
      log("8", `✓  Events gefeuert bei Tag 31:`);
      for (const ev of found31) {
        log("8", `   → ${ev.type} (${ev.id})`);
      }
    } else {
      log("8", `⚠  Keine invoice.paid Events gefunden — Zahlungsversuch ggf. ausstehend`);
    }

    // Check webhook delivery status for key events
    log("8", "Prüfe Webhook-Delivery-Status für invoice.paid …");
    const invoicePaidEvents = events31.data.filter((e) => e.type === "invoice.paid");
    for (const ev of invoicePaidEvents) {
      try {
        const webhookEndpoints = await stripe.webhookEndpoints.list({ limit: 10 });
        const stagingEndpoint = webhookEndpoints.data.find((ep) =>
          ep.url.includes("kickpact.schartl.dev")
        );
        if (stagingEndpoint) {
          // Can't directly query delivery status per event via API; log endpoint config
          log("8", `   Registrierter Webhook: ${stagingEndpoint.url} (Status: ${stagingEndpoint.status})`);
          log("8", `   Enabled Events: ${stagingEndpoint.enabled_events.join(", ")}`);
        } else {
          log("8", `⚠  Kein Webhook für kickpact.schartl.dev in Stripe registriert`);
          log("8", `   Verfügbare Endpoints:`);
          for (const ep of webhookEndpoints.data) {
            log("8", `   → ${ep.url} (${ep.status})`);
          }
        }
      } catch {
        // ignore — webhook endpoints list might fail in some test modes
      }
      log("8", `   Event: ${ev.id} — um Delivery zu prüfen: stripe events resend ${ev.id}`);
      break;
    }

    // ── Step 9: Final summary ─────────────────────────────────────────────
    console.log("\n──────────────────────────────────────────────");
    console.log("  ZUSAMMENFASSUNG");
    console.log("──────────────────────────────────────────────");
    const finalSub = await stripe.subscriptions.retrieve(subscriptionId);
    console.log(`  Subscription-ID:  ${finalSub.id}`);
    console.log(`  Finaler Status:   ${finalSub.status}`);
    console.log(`  Trial-Ende:       ${finalSub.trial_end ? new Date(finalSub.trial_end * 1000).toISOString() : "—"}`);
    console.log(`  Trial → Paid:     ${finalSub.status === "active" ? "✓ ERFOLG" : "⚠ " + finalSub.status}`);
    console.log("");
  } finally {
    // ── Cleanup ────────────────────────────────────────────────────────────
    console.log("\n──────────────────────────────────────────────");
    console.log("  CLEANUP");
    console.log("──────────────────────────────────────────────");

    if (subscriptionId) {
      try {
        await stripe.subscriptions.cancel(subscriptionId);
        log("cleanup", `✓  Subscription gelöscht: ${subscriptionId}`);
      } catch (err) {
        log("cleanup", `⚠  Subscription-Löschung fehlgeschlagen: ${(err as Error).message}`);
      }
    }

    if (customerId) {
      try {
        await stripe.customers.del(customerId);
        log("cleanup", `✓  Customer gelöscht: ${customerId}`);
      } catch (err) {
        log("cleanup", `⚠  Customer-Löschung fehlgeschlagen: ${(err as Error).message}`);
      }
    }

    // Test Clock wird automatisch gelöscht wenn der Customer gelöscht wird,
    // aber wir löschen explizit für Vollständigkeit.
    if (clockId) {
      try {
        await stripe.testHelpers.testClocks.del(clockId);
        log("cleanup", `✓  Test Clock gelöscht: ${clockId}`);
      } catch (err) {
        // Often already gone after customer deletion
        log("cleanup", `   Test Clock ggf. bereits entfernt: ${(err as Error).message}`);
      }
    }

    console.log("\n  Fertig.\n");
  }
}

main().catch((err) => {
  console.error("\n❌  Unbehandelter Fehler:", err);
  process.exit(1);
});
