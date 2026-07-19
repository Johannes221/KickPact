/**
 * Legt die 6 Live-Mode-Preise in Stripe an und gibt die Env-Zeilen für Coolify aus.
 *
 * WARUM ALS SCRIPT: Ein `sk_live_`-Key ist eine Zahlungs-Credential. Er gehört
 * nicht in einen Chat, nicht in ein Transcript und nicht in fremde Hände — auch
 * nicht in meine. Du führst das hier mit deinem Key in deiner Shell aus, der Key
 * verlässt deinen Rechner nur Richtung Stripe.
 *
 *   STRIPE_SECRET_KEY=sk_live_... npx tsx scripts/operations/create-stripe-live-prices.ts
 *
 * Erst mal trocken schauen, was passieren würde:
 *   STRIPE_SECRET_KEY=sk_live_... npx tsx scripts/operations/create-stripe-live-prices.ts --dry-run
 *
 * Idempotent: sucht vorhandene Produkte/Preise über `metadata.kickpact_key` und
 * legt nur an, was fehlt. Zweimal laufen lassen erzeugt keine Doubletten —
 * doppelte Preise wären teuer, weil der Webhook-Reverse-Lookup
 * (priceIdToPlanCycle) dann auf eine ID zeigt, die niemand gebucht hat.
 *
 * Die Beträge kommen aus lib/stripe/pricing.ts. Das ist Absicht: die Preistabelle
 * im UI und die Stripe-Preise dürfen nie auseinanderlaufen.
 */
import Stripe from "stripe";
import {
  PLANS,
  PLAN_ORDER,
  CYCLE_ORDER,
  type PlanKey,
  type BillingCycle
} from "../../lib/stripe/pricing";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY fehlt. Aufruf:");
  console.error(
    "  STRIPE_SECRET_KEY=sk_live_... npx tsx scripts/operations/create-stripe-live-prices.ts"
  );
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");

if (!key.startsWith("sk_live_") && !dryRun) {
  console.error(
    `Der Key sieht nicht nach Live-Mode aus (${key.slice(0, 8)}…).\n` +
      "Fuer Test-Mode bewusst mit --dry-run laufen lassen."
  );
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia" });

/** Stabiler Schluessel pro Plan+Cycle — Anker fuer die Idempotenz. */
function metaKey(plan: PlanKey, cycle: BillingCycle) {
  return `${plan}.${cycle}`;
}

function envName(plan: PlanKey, cycle: BillingCycle) {
  return `STRIPE_${plan.toUpperCase()}_${cycle.toUpperCase()}_PRICE_ID`;
}

/** season_end wird jaehrlich abgerechnet (ein Saison-Pass), monthly monatlich. */
function recurringFor(cycle: BillingCycle): Stripe.PriceCreateParams.Recurring {
  return cycle === "monthly"
    ? { interval: "month" }
    : { interval: "year" };
}

async function findProduct(kickpactKey: string) {
  const found = await stripe.products.search({
    query: `metadata['kickpact_key']:'${kickpactKey}'`,
    limit: 1
  });
  return found.data[0] ?? null;
}

async function findPrice(productId: string, amountCents: number, cycle: BillingCycle) {
  const prices = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  const wantInterval = recurringFor(cycle).interval;
  return (
    prices.data.find(
      (p) =>
        p.unit_amount === amountCents &&
        p.currency === "eur" &&
        p.recurring?.interval === wantInterval
    ) ?? null
  );
}

async function main() {
  const results: string[] = [];
  console.log(dryRun ? "== DRY RUN, es wird nichts angelegt ==\n" : "== Live-Mode ==\n");

  for (const plan of PLAN_ORDER) {
    for (const cycle of CYCLE_ORDER) {
      const def = PLANS[plan].cycles[cycle];
      if (!def) continue;
      const mk = metaKey(plan, cycle);
      const productName = `KickPact ${PLANS[plan].label}`;

      let product = await findProduct(mk);
      if (!product) {
        if (dryRun) {
          console.log(`  [neu] Produkt ${productName} (${mk})`);
        } else {
          product = await stripe.products.create({
            name: productName,
            description: PLANS[plan].tagline,
            metadata: { kickpact_key: mk, kickpact_plan: plan, kickpact_cycle: cycle }
          });
          console.log(`  angelegt: Produkt ${productName} (${product.id})`);
        }
      } else {
        console.log(`  vorhanden: Produkt ${productName} (${product.id})`);
      }

      if (dryRun) {
        console.log(
          `  [neu] Preis ${def.display} / ${recurringFor(cycle).interval} -> ${envName(plan, cycle)}\n`
        );
        continue;
      }

      const existing = product ? await findPrice(product.id, def.amountCents, cycle) : null;
      let priceId: string;
      if (existing) {
        priceId = existing.id;
        console.log(`  vorhanden: Preis ${def.display} (${priceId})`);
      } else {
        const price = await stripe.prices.create({
          product: product!.id,
          currency: "eur",
          unit_amount: def.amountCents,
          recurring: recurringFor(cycle),
          metadata: { kickpact_key: mk }
        });
        priceId = price.id;
        console.log(`  angelegt: Preis ${def.display} (${priceId})`);
      }
      results.push(`${envName(plan, cycle)}=${priceId}`);
      console.log("");
    }
  }

  if (dryRun) return;

  console.log("\n=== Diese 6 Zeilen in die Coolify-Env von kickpact-prod ===\n");
  for (const line of results) console.log(line);
  console.log(
    "\nDanach fehlen dort nur noch STRIPE_SECRET_KEY und STRIPE_WEBHOOK_SECRET."
  );
}

main().catch((err) => {
  console.error("Fehlgeschlagen:", err instanceof Error ? err.message : err);
  process.exit(1);
});
