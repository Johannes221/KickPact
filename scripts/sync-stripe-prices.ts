/**
 * Sync/Verify der KickPact-Stripe-Preise gegen lib/stripe/pricing.ts.
 *
 * Hintergrund (Zahlungstest 2026-06-20): Stripe-Preise sind UNVERÄNDERLICH —
 * man kann den Betrag eines Price-Objekts nicht editieren. Nach dem
 * Pricing-Rework (2026-06-15: Pro 19→11 €, Verein 49→29 €) zeigten die in
 * Coolify hinterlegten STRIPE_*_PRICE_ID noch auf die ALTEN Preisobjekte → der
 * Checkout buchte 19 € ab, obwohl /preise 11 € bewarb. Dieses Skript legt pro
 * Plan/Cycle ein Preisobjekt mit dem KORREKTEN Betrag an (idempotent) und gibt
 * die 6 Env-Zeilen zum Einfügen in Coolify/.env.local aus.
 *
 * pricing.ts ist die EINZIGE Quelle der Beträge — hier stehen keine Hardcodes,
 * damit Code und Stripe nicht erneut auseinanderlaufen.
 *
 * Modi:
 *   (default)   anlegen/finden + Env-Zeilen ausgeben (SCHREIBT in Stripe)
 *   --verify    nur lesen: die 6 gesetzten STRIPE_*_PRICE_ID gegen Stripe
 *               prüfen (unit_amount === amountCents, Intervall, Währung, aktiv).
 *               Exit 1 bei Drift — genau der Check, der den 19-€-Bug gefangen hätte.
 *
 * Sicherheit: Mit einem sk_live_-Key verweigert der Schreib-Modus den Lauf ohne
 * explizites --live. --verify ist read-only und braucht das Flag nie.
 *
 * Ausführen (Test-Modus, lädt .env.local):
 *   npm run stripe:prices            # anlegen + Env-Zeilen ausgeben
 *   npm run stripe:prices:verify     # gesetzte IDs gegen Stripe prüfen
 *
 * Live (bewusst, eigener Key — NICHT über .env.local):
 *   STRIPE_SECRET_KEY=sk_live_… npx tsx scripts/sync-stripe-prices.ts --live
 *   STRIPE_SECRET_KEY=sk_live_… npx tsx scripts/sync-stripe-prices.ts --verify
 */
import type Stripe from "stripe";
import { getStripe } from "../lib/stripe/client";
import {
  PLANS,
  PLAN_ORDER,
  CYCLE_ORDER,
  getStripePriceId,
  type PlanKey,
  type BillingCycle
} from "../lib/stripe/pricing";

/** monthly → 'month', season_end → 'year' (Saison-Pass = jährlich wiederkehrend,
 *  Jun/Jul pausiert der Inngest-Cron `pause-season-passes`). */
const CYCLE_INTERVAL: Record<BillingCycle, "month" | "year"> = {
  monthly: "month",
  season_end: "year"
};
const CURRENCY = "eur";

function envVarName(plan: PlanKey, cycle: BillingCycle): string {
  return `STRIPE_${plan.toUpperCase()}_${cycle.toUpperCase()}_PRICE_ID`;
}

/** Find-or-create ein Stripe-Product pro Plan, markiert via metadata.kickpact_plan
 *  (List+Filter statt Search-API, um Indexierungs-Verzögerung beim Re-Run zu vermeiden). */
async function findOrCreateProduct(
  stripe: Stripe,
  plan: PlanKey
): Promise<string> {
  const products = await stripe.products.list({ active: true, limit: 100 });
  const existing = products.data.find(
    (p) => p.metadata?.kickpact_plan === plan
  );
  if (existing) return existing.id;

  const created = await stripe.products.create({
    name: `KickPact ${PLANS[plan].label}`,
    metadata: { kickpact_plan: plan }
  });
  return created.id;
}

/** Find-or-create einen Recurring-Price mit korrektem Betrag/Intervall.
 *  Reuse nur bei exakter Übereinstimmung (Betrag + Intervall + Währung); ein
 *  altes Preisobjekt mit falschem Betrag wird so NIE wiederverwendet, sondern
 *  ein neues angelegt (Stripe-Preise sind immutable). */
async function findOrCreatePrice(
  stripe: Stripe,
  productId: string,
  plan: PlanKey,
  cycle: BillingCycle
): Promise<{ id: string; created: boolean }> {
  const amount = PLANS[plan].cycles[cycle].amountCents;
  const interval = CYCLE_INTERVAL[cycle];

  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    limit: 100
  });
  const match = prices.data.find(
    (p) =>
      p.unit_amount === amount &&
      p.currency === CURRENCY &&
      p.recurring?.interval === interval
  );
  if (match) return { id: match.id, created: false };

  const created = await stripe.prices.create({
    product: productId,
    currency: CURRENCY,
    unit_amount: amount,
    recurring: { interval },
    nickname: `${PLANS[plan].label} · ${cycle}`,
    metadata: { kickpact_plan: plan, kickpact_cycle: cycle }
  });
  return { id: created.id, created: true };
}

function fmtEur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR"
  });
}

async function runSync(stripe: Stripe): Promise<void> {
  const envLines: string[] = [];
  console.log("→ Lege Produkte + Preise an (idempotent) …\n");

  for (const plan of PLAN_ORDER) {
    const productId = await findOrCreateProduct(stripe, plan);
    for (const cycle of CYCLE_ORDER) {
      const { id, created } = await findOrCreatePrice(
        stripe,
        productId,
        plan,
        cycle
      );
      const amount = PLANS[plan].cycles[cycle].amountCents;
      console.log(
        `  ${created ? "✓ neu " : "↺ reuse"}  ${plan}/${cycle}  ` +
          `${fmtEur(amount).padStart(9)}  →  ${id}`
      );
      envLines.push(`${envVarName(plan, cycle)}=${id}`);
    }
  }

  console.log(
    "\n📋 Env-Zeilen für Coolify (Live + Test getrennt!) und .env.local:\n"
  );
  console.log(envLines.join("\n"));
  console.log(
    "\n⚠️  Danach `… --verify` laufen lassen, sobald die Vars gesetzt sind."
  );
}

async function runVerify(stripe: Stripe): Promise<void> {
  console.log("→ Prüfe gesetzte STRIPE_*_PRICE_ID gegen Stripe …\n");
  let failures = 0;

  for (const plan of PLAN_ORDER) {
    for (const cycle of CYCLE_ORDER) {
      const expected = PLANS[plan].cycles[cycle].amountCents;
      const label = `${plan}/${cycle}`.padEnd(20);
      const id = getStripePriceId(plan, cycle);

      if (!id) {
        console.log(`  ✗ ${label} ${envVarName(plan, cycle)} ist nicht gesetzt`);
        failures++;
        continue;
      }

      try {
        const price = await stripe.prices.retrieve(id);
        const okAmount = price.unit_amount === expected;
        const okInterval = price.recurring?.interval === CYCLE_INTERVAL[cycle];
        const okCurrency = price.currency === CURRENCY;
        const okActive = price.active === true;

        if (okAmount && okInterval && okCurrency && okActive) {
          console.log(`  ✓ ${label} ${fmtEur(expected).padStart(9)}  (${id})`);
        } else {
          failures++;
          const got = price.unit_amount;
          const reasons = [
            !okAmount &&
              `Betrag ${got === null ? "—" : fmtEur(got)} ≠ erwartet ${fmtEur(expected)}`,
            !okInterval &&
              `Intervall ${price.recurring?.interval ?? "—"} ≠ ${CYCLE_INTERVAL[cycle]}`,
            !okCurrency && `Währung ${price.currency} ≠ ${CURRENCY}`,
            !okActive && "Preis ist inaktiv"
          ].filter(Boolean);
          console.log(`  ✗ ${label} ${reasons.join(", ")}  (${id})`);
        }
      } catch (err) {
        failures++;
        console.log(
          `  ✗ ${label} Stripe-Lookup fehlgeschlagen für ${id}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }
  }

  if (failures > 0) {
    console.error(
      `\n❌ ${failures} Preis(e) stimmen nicht mit pricing.ts überein.`
    );
    process.exit(1);
  }
  console.log("\n✅ Alle 6 Preise stimmen mit pricing.ts überein.");
}

(async () => {
  const verify = process.argv.includes("--verify");
  const stripe = getStripe();
  const isLiveKey = (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_");

  if (!verify && isLiveKey && !process.argv.includes("--live")) {
    console.error(
      "✋ Live-Key erkannt. Schreiben in LIVE-Stripe nur mit explizitem --live.\n" +
        "   Erst gegen sk_test_ testen, dann bewusst:\n" +
        "   STRIPE_SECRET_KEY=sk_live_… npx tsx scripts/sync-stripe-prices.ts --live"
    );
    process.exit(1);
  }

  console.log(`Stripe-Modus: ${isLiveKey ? "LIVE 🔴" : "TEST 🟢"}\n`);
  if (verify) await runVerify(stripe);
  else await runSync(stripe);
})().catch((err) => {
  console.error("✗ Fehler:", err instanceof Error ? err.message : err);
  process.exit(1);
});
