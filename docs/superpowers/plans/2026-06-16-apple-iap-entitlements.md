# Apple IAP + Entitlement-Gating (Pricing Part B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Einen zweiten Bezahlkanal (Apple In-App-Purchase, iOS) neben Stripe (Web) einführen, der in dasselbe Entitlement-Gate schreibt — ohne Doppel-Abo, mit Anti-Steering und channel-korrekter Upgrade-UI.

**Architecture:** `subscriptions` bekommt einen `provider`-Diskriminator plus Apple-Identifier. Ein neuer Apple-Webhook spiegelt 1:1 den bestehenden Stripe-Webhook (gleiche Dedup-Tabelle, gleiches `syncSubscriptionForClub`, authoritative Re-Fetch via Apple App Store Server API). Eine Kanal-Invariante an beiden Schreibstellen verhindert Doppel-Abos. Das bestehende `gateFromSubscription()`-Gate bleibt unverändert — es liest nur `status`, den beide Provider gleich beschreiben.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM (Postgres), Vitest, `@apple/app-store-server-library` (JWS-Verifikation + App Store Server API), Capacitor + StoreKit 2 (Swift-Plugin).

**Spec:** [docs/superpowers/specs/2026-06-16-apple-iap-entitlements-design.md](../specs/2026-06-16-apple-iap-entitlements-design.md)

---

## File Structure

**Datenmodell**
- Modify: `lib/db/schema/billing.ts` — `billingProviderEnum` + 3 Spalten auf `subscriptions`
- Create: `drizzle/migrations/0060_*.sql` — via `npm run db:generate` (Name auto-generiert)

**Reine Logik (gut testbar, kein I/O)**
- Modify: `lib/stripe/pricing.ts` — `APPLE_PRODUCTS`-Map + `appleProductToPlanCycle()`
- Create: `lib/billing/apple-notifications.ts` — `mapAppleNotificationToStatus()` (pure)
- Create: `lib/billing/plan-features.ts` (modify) — `FEATURE_BY_PLAN` + `PLAN_CAPS` daraus ableiten
- Create: `lib/billing/checkout-channel.ts` — `getCheckoutChannel()` (client)

**DB-Query-Layer**
- Modify: `lib/db/queries/subscriptions.ts` — Apple-Pendants zu den Stripe-Sync-Funktionen
- Modify: `lib/db/schema/system.ts` — Dedup-Tabelle wird wiederverwendet (kein Schema-Change; nur Doku)

**Server-Endpunkte**
- Create: `lib/apple/verifier.ts` — Wrapper um `@apple/app-store-server-library`
- Create: `app/api/apple/verify/route.ts` — Sofort-Verifikation nach Kauf
- Create: `app/api/apple/notifications/route.ts` — async Server-Notifications

**Bezahl-Pfad-Guards**
- Modify: `lib/actions/subscriptions.ts` — Kanal-Invariante in `createCheckoutSession`
- Modify: `app/api/stripe/webhook/route.ts` — `provider==='apple'`-Guard

**UI**
- Create: `components/billing/upgrade-gate.tsx` — `<UpgradeGate>`
- (Integration der 3 Trigger erfolgt in Task 9)

**Client-Plugin (zuletzt, braucht Xcode)**
- Create: `ios/App/App/IAPPlugin.swift` + `IAPPlugin.m`
- Create: `lib/platform/iap.ts` — TS-Bridge (web-inert)

**Tests**
- `tests/billing/apple-notifications.test.ts`
- `tests/billing/plan-features.test.ts` (erweitern)
- `tests/billing/checkout-channel.test.ts`
- `tests/stripe/pricing.test.ts` (erweitern — Apple-Product-Mapping)
- `tests/api/apple-verify.test.ts`
- `tests/api/apple-notifications.test.ts`
- `tests/actions/subscriptions-channel-invariant.test.ts`

**Test-Befehl (kanonisch):** Einzeldateien mit `npx vitest run <pfad>`. Voll-Lauf nur batchweise (`npm test -- tests/billing tests/stripe`), niemals singleFork über alles (OOM, siehe STATE.md).

---

## Task 1: Datenmodell — provider + Apple-Spalten

**Files:**
- Modify: `lib/db/schema/billing.ts`
- Generate: `drizzle/migrations/0060_*.sql`
- Test: `tests/billing/schema-provider.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/billing/schema-provider.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { subscriptions, billingProviderEnum } from "@/lib/db/schema/billing";

describe("subscriptions provider columns", () => {
  it("exposes the billingProviderEnum with stripe/apple/google", () => {
    expect(billingProviderEnum.enumValues).toEqual(["stripe", "apple", "google"]);
  });

  it("has provider + apple identifier columns", () => {
    const cols = Object.keys(subscriptions);
    expect(cols).toContain("provider");
    expect(cols).toContain("appleOriginalTransactionId");
    expect(cols).toContain("appleExpiresAt");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/billing/schema-provider.test.ts`
Expected: FAIL — `billingProviderEnum` is not exported / columns missing.

- [ ] **Step 3: Add enum + columns to schema**

In `lib/db/schema/billing.ts`, after the existing `billingCycleEnum` block (around line 18), add:

```ts
// Part B: Bezahlkanal-Diskriminator. 'google' inert reserviert (kein Code,
// analog zum inerten 'annual'-Cycle) für späteres Play-Billing.
export const billingProviderEnum = pgEnum("billing_provider", [
  "stripe",
  "apple",
  "google"
]);
```

In der `subscriptions`-Tabelle (nach `pastDueSince`, vor `createdAt`) ergänzen:

```ts
  // Part B: gesetzt beim ERSTEN echten Kauf; steuert die Kanal-Invariante
  // (kein Doppel-Abo). NULL = Trial/unlizenziert, beide Kanäle offen.
  provider: billingProviderEnum("provider"),
  // Apples stabiler Abo-Identifier (bleibt über Renewals/Upgrades gleich).
  // Pendant zu stripeSubscriptionId.
  appleOriginalTransactionId: text("apple_original_transaction_id").unique(),
  // Ablauf der aktuellen Apple-Periode. Pendant zu currentPeriodEnd.
  appleExpiresAt: timestamp("apple_expires_at", { withTimezone: true }),
```

- [ ] **Step 4: Generate the migration**

Run: `npm run db:generate`
Expected: Neue Datei `drizzle/migrations/0060_*.sql` mit `ALTER TABLE "subscriptions" ADD COLUMN ...` + `CREATE TYPE "billing_provider"`. Kurz öffnen und prüfen, dass nur additive Statements drinstehen (keine Drops).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/billing/schema-provider.test.ts`
Expected: PASS.

- [ ] **Step 6: Apply migration locally + typecheck**

Run: `npm run db:migrate && npx tsc --noEmit`
Expected: Migration applied, 0 Type-Errors.

- [ ] **Step 7: Commit**

```bash
git add lib/db/schema/billing.ts drizzle/migrations/ tests/billing/schema-provider.test.ts
git commit -m "feat(iap): provider-Diskriminator + Apple-Spalten auf subscriptions (Migration 0060)"
```

---

## Task 2: Apple-Produkt-Mapping in pricing.ts

**Files:**
- Modify: `lib/stripe/pricing.ts`
- Test: `tests/stripe/pricing.test.ts` (erweitern)

- [ ] **Step 1: Write the failing test**

In `tests/stripe/pricing.test.ts`, neuen Import ergänzen und Block am Ende anhängen:

```ts
import { APPLE_PRODUCTS, appleProductToPlanCycle } from "@/lib/stripe/pricing";

describe("Apple IAP product mapping", () => {
  it("defines all 6 product IDs", () => {
    expect(Object.keys(APPLE_PRODUCTS).sort()).toEqual([
      "kickpact.basic.monthly",
      "kickpact.basic.season",
      "kickpact.pro.monthly",
      "kickpact.pro.season",
      "kickpact.verein.monthly",
      "kickpact.verein.season"
    ]);
  });

  it("maps a product ID back to plan + cycle", () => {
    expect(appleProductToPlanCycle("kickpact.pro.season")).toEqual({
      plan: "pro",
      cycle: "season_end"
    });
    expect(appleProductToPlanCycle("kickpact.basic.monthly")).toEqual({
      plan: "basic",
      cycle: "monthly"
    });
  });

  it("returns null for an unknown product ID", () => {
    expect(appleProductToPlanCycle("com.foo.bar")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/stripe/pricing.test.ts`
Expected: FAIL — `APPLE_PRODUCTS` not exported.

- [ ] **Step 3: Implement the mapping**

Am Ende von `lib/stripe/pricing.ts` anfügen:

```ts
/**
 * Part B — Apple IAP Product-IDs (App Store Connect, angelegt via
 * scripts/create-asc-iap-products.mjs). Apple-„season" = ONE_YEAR-Periode,
 * intern aber unser season_end-Cycle.
 */
export const APPLE_PRODUCTS: Record<
  string,
  { plan: PlanKey; cycle: BillingCycle }
> = {
  "kickpact.basic.monthly": { plan: "basic", cycle: "monthly" },
  "kickpact.basic.season": { plan: "basic", cycle: "season_end" },
  "kickpact.pro.monthly": { plan: "pro", cycle: "monthly" },
  "kickpact.pro.season": { plan: "pro", cycle: "season_end" },
  "kickpact.verein.monthly": { plan: "verein", cycle: "monthly" },
  "kickpact.verein.season": { plan: "verein", cycle: "season_end" }
};

/** Reverse-Lookup Apple-Product-ID → (plan, cycle). Pendant zu priceIdToPlanCycle. */
export function appleProductToPlanCycle(
  productId: string
): { plan: PlanKey; cycle: BillingCycle } | null {
  return APPLE_PRODUCTS[productId] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/stripe/pricing.test.ts`
Expected: PASS (alle bisherigen + 3 neue).

- [ ] **Step 5: Commit**

```bash
git add lib/stripe/pricing.ts tests/stripe/pricing.test.ts
git commit -m "feat(iap): Apple-Product-ID → (plan, cycle) Mapping"
```

---

## Task 3: Notification-Type → Status-Mapping (pure)

**Files:**
- Create: `lib/billing/apple-notifications.ts`
- Test: `tests/billing/apple-notifications.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/billing/apple-notifications.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapAppleNotificationToStatus } from "@/lib/billing/apple-notifications";

describe("mapAppleNotificationToStatus", () => {
  it("SUBSCRIBED / DID_RENEW → active", () => {
    expect(mapAppleNotificationToStatus("SUBSCRIBED")).toBe("active");
    expect(mapAppleNotificationToStatus("DID_RENEW")).toBe("active");
    expect(mapAppleNotificationToStatus("OFFER_REDEEMED")).toBe("active");
  });

  it("DID_FAIL_TO_RENEW (billing retry) → past_due", () => {
    expect(mapAppleNotificationToStatus("DID_FAIL_TO_RENEW")).toBe("past_due");
  });

  it("EXPIRED / GRACE_PERIOD_EXPIRED → cancelled", () => {
    expect(mapAppleNotificationToStatus("EXPIRED")).toBe("cancelled");
    expect(mapAppleNotificationToStatus("GRACE_PERIOD_EXPIRED")).toBe("cancelled");
  });

  it("REFUND / REVOKE → cancelled", () => {
    expect(mapAppleNotificationToStatus("REFUND")).toBe("cancelled");
    expect(mapAppleNotificationToStatus("REVOKE")).toBe("cancelled");
  });

  it("DID_CHANGE_RENEWAL_STATUS / _PREF → active (läuft bis Periodenende)", () => {
    expect(mapAppleNotificationToStatus("DID_CHANGE_RENEWAL_STATUS")).toBe("active");
    expect(mapAppleNotificationToStatus("DID_CHANGE_RENEWAL_PREF")).toBe("active");
  });

  it("unknown type → null (Endpoint antwortet 200, kein Write)", () => {
    expect(mapAppleNotificationToStatus("SOME_FUTURE_TYPE")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/billing/apple-notifications.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/billing/apple-notifications.ts`:

```ts
import type { SubscriptionStatus } from "@/lib/db/queries/subscription-status";

/**
 * Part B — App Store Server Notifications V2: notificationType → interner
 * subscription_status. Spiegelt die Mapping-Tabelle aus der Spec §4.5.
 *
 * Rückgabe null = unbekannter Typ; der Webhook antwortet dann 200 ohne Write
 * (kein Retry-Sturm, kein Status-Murks).
 */
export function mapAppleNotificationToStatus(
  notificationType: string
): SubscriptionStatus | null {
  switch (notificationType) {
    case "SUBSCRIBED":
    case "DID_RENEW":
    case "OFFER_REDEEMED":
      return "active";
    // Auto-Renew aus/Plan-Wechsel: Abo läuft bis appleExpiresAt weiter.
    case "DID_CHANGE_RENEWAL_STATUS":
    case "DID_CHANGE_RENEWAL_PREF":
      return "active";
    // Billing-Retry-Phase (Grace) — wie Stripe past_due.
    case "DID_FAIL_TO_RENEW":
      return "past_due";
    case "EXPIRED":
    case "GRACE_PERIOD_EXPIRED":
    case "REFUND":
    case "REVOKE":
      return "cancelled";
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/billing/apple-notifications.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/billing/apple-notifications.ts tests/billing/apple-notifications.test.ts
git commit -m "feat(iap): Apple-Notification-Type → Status-Mapping (pure)"
```

---

## Task 4: FEATURE_BY_PLAN als Single Source

**Files:**
- Modify: `lib/billing/plan-features.ts`
- Modify: `lib/stripe/pricing.ts` (PLAN_CAPS aus FEATURE_BY_PLAN ableiten)
- Test: `tests/billing/plan-features.test.ts`

> **Ziel:** UI-Versprechen und Cap-Enforcement aus einer Quelle. `PLAN_CAPS`
> bleibt exportiert (viele Consumer), wird aber aus `FEATURE_BY_PLAN` abgeleitet,
> damit es nie driftet.

- [ ] **Step 1: Write the failing test**

Create `tests/billing/plan-features.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { FEATURE_BY_PLAN } from "@/lib/billing/plan-features";
import { PLAN_CAPS, PLAN_ORDER } from "@/lib/stripe/pricing";

describe("FEATURE_BY_PLAN", () => {
  it("covers every plan", () => {
    for (const plan of PLAN_ORDER) {
      expect(FEATURE_BY_PLAN[plan], plan).toBeDefined();
    }
  });

  it("basic caps match the canonical PLAN_CAPS", () => {
    expect(FEATURE_BY_PLAN.basic.maxSponsorsPerTeam).toBe(
      PLAN_CAPS.basic.maxSponsorsPerTeam
    );
    expect(FEATURE_BY_PLAN.basic.maxPledgeRulesPerSponsor).toBe(
      PLAN_CAPS.basic.maxPledgeRulesPerSponsor
    );
  });

  it("pro + verein are uncapped (null)", () => {
    expect(FEATURE_BY_PLAN.pro.maxSponsorsPerTeam).toBeNull();
    expect(FEATURE_BY_PLAN.verein.maxSponsorsPerTeam).toBeNull();
  });

  it("each plan ships a non-empty upgrade headline + feature list", () => {
    for (const plan of PLAN_ORDER) {
      expect(FEATURE_BY_PLAN[plan].upgradeHeadline.length).toBeGreaterThan(0);
      expect(FEATURE_BY_PLAN[plan].highlights.length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/billing/plan-features.test.ts`
Expected: FAIL — `FEATURE_BY_PLAN` not exported.

- [ ] **Step 3: Add FEATURE_BY_PLAN to plan-features.ts**

Oben in `lib/billing/plan-features.ts` (nach den Imports) einfügen:

```ts
import type { PlanKey } from "@/lib/stripe/pricing";

export interface PlanFeatureDef {
  /** Cap: null = unlimited. Speist die Enforcement (PLAN_CAPS leitet sich ab). */
  maxSponsorsPerTeam: number | null;
  maxPledgeRulesPerSponsor: number | null;
  /** UI: Überschrift im Upgrade-Sheet, wenn man auf DIESEN Plan upgraden würde. */
  upgradeHeadline: string;
  /** UI: Bullet-Liste, was dieser Plan freischaltet. */
  highlights: string[];
}

/**
 * Part B — Single Source für Feature-Gating: speist SOWOHL die UI-Texte im
 * <UpgradeGate> ALS AUCH die Cap-Enforcement (PLAN_CAPS in lib/stripe/pricing.ts
 * wird hieraus abgeleitet). Verhindert Drift zwischen Versprechen und Realität.
 */
export const FEATURE_BY_PLAN: Record<PlanKey, PlanFeatureDef> = {
  basic: {
    maxSponsorsPerTeam: 5,
    maxPledgeRulesPerSponsor: 3,
    upgradeHeadline: "Mehr Sponsoren? Mit Pro unbegrenzt.",
    highlights: [
      "Bis zu 5 Sponsoren, 3 Regeln pro Sponsor",
      "Alle Auto-Trigger + Manual-Trigger"
    ]
  },
  pro: {
    maxSponsorsPerTeam: null,
    maxPledgeRulesPerSponsor: null,
    upgradeHeadline: "Sponsoring, das mitfiebert — ohne Limits.",
    highlights: [
      "∞ Sponsoren · ∞ Regeln · ∞ Historie",
      "Saison-Ziele, Custom-Trigger-Texte, Embed-Widget",
      "Vereins-Logo auf PDF, CSV-Export, Saison-Recap"
    ]
  },
  verein: {
    maxSponsorsPerTeam: null,
    maxPledgeRulesPerSponsor: null,
    upgradeHeadline: "Der ganze Verein. Ein Tarif.",
    highlights: [
      "∞ Mannschaften unter einer Lizenz",
      "Master-Admin-Cockpit + bis zu 10 Admins",
      "Konsolidierte Sammelrechnung, Cross-Team-View"
    ]
  }
};
```

- [ ] **Step 4: Derive PLAN_CAPS from FEATURE_BY_PLAN**

In `lib/stripe/pricing.ts` den `PLAN_CAPS`-Block (ca. Zeile 257–267) ersetzen durch eine Ableitung. **Wichtig:** Importzyklus vermeiden — `FEATURE_BY_PLAN` importiert `PlanKey` aus pricing.ts. Daher die Cap-Werte in pricing.ts als kanonische Konstante lassen UND in plan-features.ts NUR die Texte ergänzen, die Caps aber aus pricing.ts re-exportieren. Konkret: `FEATURE_BY_PLAN` referenziert die Caps aus `PLAN_CAPS`:

Ersetze in `lib/billing/plan-features.ts` die hartkodierten Cap-Zahlen durch:

```ts
import { PLAN_CAPS } from "@/lib/stripe/pricing";
// ... in FEATURE_BY_PLAN je Plan:
//   maxSponsorsPerTeam: PLAN_CAPS.basic.maxSponsorsPerTeam,
//   maxPledgeRulesPerSponsor: PLAN_CAPS.basic.maxPledgeRulesPerSponsor,
```

So bleibt `PLAN_CAPS` in pricing.ts die kanonische Quelle (keine Zyklen, da pricing.ts NICHT aus plan-features.ts importiert), und `FEATURE_BY_PLAN` zieht die Caps daraus. Passe die `FEATURE_BY_PLAN`-Literale aus Step 3 entsprechend an (Cap-Felder = `PLAN_CAPS.<plan>.<feld>`).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/billing/plan-features.test.ts tests/stripe/pricing.test.ts`
Expected: PASS (Konsistenz-Test grün, weil Caps aus derselben Quelle stammen).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 Errors (kein Importzyklus).

- [ ] **Step 7: Commit**

```bash
git add lib/billing/plan-features.ts tests/billing/plan-features.test.ts
git commit -m "feat(iap): FEATURE_BY_PLAN als Single Source für Gating-Texte + Caps"
```

---

## Task 5: getCheckoutChannel + Anti-Steering-Helper

**Files:**
- Create: `lib/billing/checkout-channel.ts`
- Test: `tests/billing/checkout-channel.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/billing/checkout-channel.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => vi.unstubAllGlobals());

async function loadWithUA(ua: string) {
  vi.stubGlobal("window", {
    navigator: { userAgent: ua },
    Capacitor: undefined
  });
  vi.resetModules();
  return await import("@/lib/billing/checkout-channel");
}

describe("getCheckoutChannel", () => {
  it("returns 'apple' inside the iOS app (KickPactApp UA)", async () => {
    const { getCheckoutChannel } = await loadWithUA("Mozilla/5.0 KickPactApp");
    expect(getCheckoutChannel()).toBe("apple");
  });

  it("returns 'stripe' on the web", async () => {
    const { getCheckoutChannel } = await loadWithUA("Mozilla/5.0 Safari");
    expect(getCheckoutChannel()).toBe("stripe");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/billing/checkout-channel.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/billing/checkout-channel.ts`:

```ts
import { isIOSApp } from "@/lib/platform/native";

export type CheckoutChannel = "stripe" | "apple";

/**
 * Part B — der einzige Entscheider, welcher Bezahlpfad + welche Preis-Darstellung
 * gilt. Im iOS-Kontext IMMER Apple (Anti-Steering, Guideline 3.1.1/3.1.3 — kein
 * Stripe-CTA, keine Web-Preise). Auf Web: Stripe.
 *
 * Client-only (isIOSApp braucht window). Server-Pfade nutzen isNativeAppRequest()
 * aus lib/platform/native-server.ts.
 */
export function getCheckoutChannel(): CheckoutChannel {
  return isIOSApp() ? "apple" : "stripe";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/billing/checkout-channel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/billing/checkout-channel.ts tests/billing/checkout-channel.test.ts
git commit -m "feat(iap): getCheckoutChannel — zentraler Anti-Steering-Schalter"
```

---

## Task 6: Apple-Query-Layer (DB)

**Files:**
- Modify: `lib/db/queries/subscriptions.ts`
- Test: `tests/queries/apple-subscriptions.test.ts`

> Apple-Pendants zu `syncSubscriptionForClub` / `getSubscriptionCustomerId`.
> Diese Tests sind Integration-Tests (echte Test-DB) — Muster aus
> `tests/queries/` übernehmen (siehe vorhandene Dateien dort).

- [ ] **Step 1: Write the failing test**

Create `tests/queries/apple-subscriptions.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db/client";
import { clubs, subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  syncAppleSubscriptionForClub,
  getClubIdByOriginalTransactionId,
  getSubscriptionProvider
} from "@/lib/db/queries/subscriptions";

const CLUB_ID = "test_apple_club_1";

beforeEach(async () => {
  await db.delete(subscriptions).where(eq(subscriptions.clubId, CLUB_ID));
  await db.delete(clubs).where(eq(clubs.id, CLUB_ID));
  await db.insert(clubs).values({
    id: CLUB_ID, slug: "apple-test", name: "Apple Test"
  });
  await db.insert(subscriptions).values({ clubId: CLUB_ID, status: "trialing" });
});

describe("syncAppleSubscriptionForClub", () => {
  it("writes provider=apple + identifiers + status", async () => {
    await syncAppleSubscriptionForClub(CLUB_ID, {
      originalTransactionId: "apple_otx_1",
      status: "active",
      billingCycle: "season_end",
      appleExpiresAt: new Date("2027-01-01")
    });
    const [row] = await db.select().from(subscriptions)
      .where(eq(subscriptions.clubId, CLUB_ID));
    expect(row.provider).toBe("apple");
    expect(row.appleOriginalTransactionId).toBe("apple_otx_1");
    expect(row.status).toBe("active");
    expect(row.billingCycle).toBe("season_end");
  });
});

describe("reverse lookups", () => {
  it("finds the club by original transaction id", async () => {
    await syncAppleSubscriptionForClub(CLUB_ID, {
      originalTransactionId: "apple_otx_2",
      status: "active",
      billingCycle: "monthly",
      appleExpiresAt: null
    });
    expect(await getClubIdByOriginalTransactionId("apple_otx_2")).toBe(CLUB_ID);
    expect(await getClubIdByOriginalTransactionId("nope")).toBeNull();
  });

  it("reads the current provider", async () => {
    expect(await getSubscriptionProvider(CLUB_ID)).toBeNull(); // trial, kein Kauf
    await syncAppleSubscriptionForClub(CLUB_ID, {
      originalTransactionId: "apple_otx_3",
      status: "active",
      billingCycle: "monthly",
      appleExpiresAt: null
    });
    expect(await getSubscriptionProvider(CLUB_ID)).toBe("apple");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/queries/apple-subscriptions.test.ts`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement the query functions**

In `lib/db/queries/subscriptions.ts` ergänzen (nach `syncSubscriptionForClub`):

```ts
export interface AppleSubscriptionSync {
  originalTransactionId: string;
  status: SubscriptionStatus;
  billingCycle: BillingCycle;
  appleExpiresAt: Date | null;
}

/** Part B — Apple-Pendant zu syncSubscriptionForClub. Setzt provider='apple'. */
export async function syncAppleSubscriptionForClub(
  clubId: string,
  patch: AppleSubscriptionSync
): Promise<void> {
  await db
    .update(subscriptions)
    .set({
      provider: "apple",
      appleOriginalTransactionId: patch.originalTransactionId,
      status: patch.status,
      billingCycle: patch.billingCycle,
      appleExpiresAt: patch.appleExpiresAt,
      pastDueSince: pastDueSincePatch(patch.status),
      updatedAt: new Date()
    })
    .where(eq(subscriptions.clubId, clubId));
}

/** Club-Lookup über Apples stabilen Abo-Identifier (für den Webhook). */
export async function getClubIdByOriginalTransactionId(
  originalTransactionId: string
): Promise<string | null> {
  const [row] = await db
    .select({ clubId: subscriptions.clubId })
    .from(subscriptions)
    .where(eq(subscriptions.appleOriginalTransactionId, originalTransactionId))
    .limit(1);
  return row?.clubId ?? null;
}

/** Aktueller Bezahlkanal eines Clubs (für die Kanal-Invariante). */
export async function getSubscriptionProvider(
  clubId: string
): Promise<"stripe" | "apple" | "google" | null> {
  const [row] = await db
    .select({ provider: subscriptions.provider })
    .from(subscriptions)
    .where(eq(subscriptions.clubId, clubId))
    .limit(1);
  return row?.provider ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/queries/apple-subscriptions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/queries/subscriptions.ts tests/queries/apple-subscriptions.test.ts
git commit -m "feat(iap): Apple-Query-Layer (sync, reverse-lookup, provider)"
```

---

## Task 7: JWS-Verifier-Wrapper

**Files:**
- Create: `lib/apple/verifier.ts`
- Modify: `package.json` (Dependency)
- Test: `tests/billing/apple-verifier.test.ts`

> `@apple/app-store-server-library` ist Apples offizielle Node-Lib. Sie
> verifiziert signierte Notifications/Transactions gegen die Apple Root CA und
> spricht die App Store Server API. Wir kapseln sie in einem schmalen Wrapper,
> der ohne Credentials web-inert ist (analog `lib/notifications/apns.ts`).

- [ ] **Step 1: Install the dependency**

Run: `npm install @apple/app-store-server-library`
Expected: Paket in `package.json` unter dependencies.

- [ ] **Step 2: Write the failing test**

Create `tests/billing/apple-verifier.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isAppleIapConfigured } from "@/lib/apple/verifier";

describe("isAppleIapConfigured", () => {
  it("is false when no APPLE_IAP env is set", () => {
    const prev = process.env.APPLE_IAP_BUNDLE_ID;
    delete process.env.APPLE_IAP_BUNDLE_ID;
    expect(isAppleIapConfigured()).toBe(false);
    if (prev) process.env.APPLE_IAP_BUNDLE_ID = prev;
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/billing/apple-verifier.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the wrapper**

Create `lib/apple/verifier.ts`:

```ts
import "server-only";
import {
  SignedDataVerifier,
  Environment,
  type DecodedSignedData
} from "@apple/app-store-server-library";

/**
 * Part B — Wrapper um Apples offizielle Verifikations-Lib. Web-inert ohne
 * Credentials (analog apns.ts). Verifiziert signierte App-Store-Notifications
 * + Transactions gegen die Apple Root CA.
 *
 * Env (Coolify): APPLE_IAP_BUNDLE_ID, APPLE_IAP_ENV ('sandbox'|'production').
 * Die Apple Root CAs liegen als PEM in APPLE_IAP_ROOT_CERTS (base64, komma-sep)
 * oder werden aus dem mitgelieferten Cert-Bundle gelesen.
 */
const BUNDLE_ID = process.env.APPLE_IAP_BUNDLE_ID ?? "";
const APP_APPLE_ID = Number(process.env.APPLE_IAP_APP_APPLE_ID ?? "0");
const ENV =
  process.env.APPLE_IAP_ENV === "production"
    ? Environment.PRODUCTION
    : Environment.SANDBOX;

export function isAppleIapConfigured(): boolean {
  return BUNDLE_ID.length > 0;
}

function loadRootCerts(): Buffer[] {
  const raw = process.env.APPLE_IAP_ROOT_CERTS ?? "";
  if (!raw) return [];
  return raw.split(",").map((b64) => Buffer.from(b64.trim(), "base64"));
}

let _verifier: SignedDataVerifier | null = null;
function getVerifier(): SignedDataVerifier {
  if (!isAppleIapConfigured()) {
    throw new Error("Apple IAP nicht konfiguriert (APPLE_IAP_BUNDLE_ID fehlt).");
  }
  if (!_verifier) {
    _verifier = new SignedDataVerifier(
      loadRootCerts(),
      true, // enableOnlineChecks (OCSP)
      ENV,
      BUNDLE_ID,
      APP_APPLE_ID
    );
  }
  return _verifier;
}

/** Verifiziert + decodiert eine App Store Server Notification (signedPayload). */
export async function verifyNotification(
  signedPayload: string
): Promise<DecodedSignedData> {
  return getVerifier().verifyAndDecodeNotification(signedPayload);
}

/** Verifiziert + decodiert eine signierte Transaction (JWS aus dem Client-Kauf). */
export async function verifyTransaction(
  signedTransaction: string
): Promise<DecodedSignedData> {
  return getVerifier().verifyAndDecodeTransaction(signedTransaction);
}
```

> **Hinweis für den Implementierer:** Die exakten Konstruktor-/Methoden-Namen
> der Lib gegen die installierte Version prüfen (`node_modules/@apple/app-store-server-library/dist/`).
> Falls die Signatur abweicht (z.B. `verifyAndDecodeNotification` heißt anders),
> Wrapper-Intern anpassen — die EXPORTE (`isAppleIapConfigured`,
> `verifyNotification`, `verifyTransaction`) bleiben stabil, sodass die
> Consumer in Task 8/9 unberührt sind.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/billing/apple-verifier.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 Errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/apple/verifier.ts tests/billing/apple-verifier.test.ts
git commit -m "feat(iap): JWS-Verifier-Wrapper um @apple/app-store-server-library"
```

---

## Task 8: Sofort-Verify-Endpoint + Kanal-Invariante

**Files:**
- Create: `app/api/apple/verify/route.ts`
- Test: `tests/api/apple-verify.test.ts`

> Nach dem Client-Kauf POSTet die App das JWS hierher. Session-gated (nur der
> eingeloggte Club-Admin). Verifiziert → authoritative-Fetch implizit im JWS →
> Kanal-Invariante → DB-Write.

- [ ] **Step 1: Write the failing test**

Create `tests/api/apple-verify.test.ts`. Mockt Verifier + Session + Queries:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/apple/verifier", () => ({
  isAppleIapConfigured: () => true,
  verifyTransaction: vi.fn()
}));
vi.mock("@/lib/auth/scope", () => ({
  assertClubAccess: vi.fn()
}));
vi.mock("@/lib/db/queries/subscriptions", () => ({
  getSubscriptionProvider: vi.fn(),
  syncAppleSubscriptionForClub: vi.fn(),
  setTeamLicensesPlanForSubscription: vi.fn()
}));

const { verifyTransaction } = await import("@/lib/apple/verifier");
const { assertClubAccess } = await import("@/lib/auth/scope");
const subs = await import("@/lib/db/queries/subscriptions");
const { POST } = await import("@/app/api/apple/verify/route");

function req(body: unknown) {
  return new Request("https://t.dev/api/apple/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (assertClubAccess as any).mockResolvedValue({ club: { id: "club_1", slug: "x" } });
  (verifyTransaction as any).mockResolvedValue({
    productId: "kickpact.pro.season",
    originalTransactionId: "otx_1",
    expiresDate: 1800000000000
  });
});

describe("POST /api/apple/verify", () => {
  it("rejects when the club already pays via Stripe (channel invariant)", async () => {
    (subs.getSubscriptionProvider as any).mockResolvedValue("stripe");
    const res = await POST(req({ clubSlug: "x", signedTransaction: "jws" }) as any);
    expect(res.status).toBe(409);
    expect(subs.syncAppleSubscriptionForClub).not.toHaveBeenCalled();
  });

  it("writes the entitlement on a clean apple purchase", async () => {
    (subs.getSubscriptionProvider as any).mockResolvedValue(null);
    const res = await POST(req({ clubSlug: "x", signedTransaction: "jws" }) as any);
    expect(res.status).toBe(200);
    expect(subs.syncAppleSubscriptionForClub).toHaveBeenCalledWith("club_1",
      expect.objectContaining({ originalTransactionId: "otx_1", status: "active" }));
    expect(subs.setTeamLicensesPlanForSubscription).toHaveBeenCalledWith("club_1", "pro");
  });

  it("rejects an unparseable / unknown product", async () => {
    (subs.getSubscriptionProvider as any).mockResolvedValue(null);
    (verifyTransaction as any).mockResolvedValue({
      productId: "com.foo.bar", originalTransactionId: "otx_2", expiresDate: 0
    });
    const res = await POST(req({ clubSlug: "x", signedTransaction: "jws" }) as any);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/apple-verify.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement the route**

Create `app/api/apple/verify/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { isAppleIapConfigured, verifyTransaction } from "@/lib/apple/verifier";
import { assertClubAccess } from "@/lib/auth/scope";
import { appleProductToPlanCycle } from "@/lib/stripe/pricing";
import {
  getSubscriptionProvider,
  syncAppleSubscriptionForClub,
  setTeamLicensesPlanForSubscription
} from "@/lib/db/queries/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Part B — Sofort-Verifikation nach Client-Kauf (StoreKit). Session-gated:
 * nur der eingeloggte Club-Admin darf einen Kauf SEINEM Club zuordnen.
 * Kanal-Invariante: kein Apple-Kauf, wenn der Club bereits über Stripe zahlt.
 */
export async function POST(req: NextRequest) {
  if (!isAppleIapConfigured()) {
    return NextResponse.json({ error: "apple-not-configured" }, { status: 503 });
  }

  let body: { clubSlug?: string; signedTransaction?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad-json" }, { status: 400 });
  }
  const { clubSlug, signedTransaction } = body;
  if (!clubSlug || !signedTransaction) {
    return NextResponse.json({ error: "missing-fields" }, { status: 400 });
  }

  // Session-Gate (wirft/redirected bei fehlender Berechtigung).
  const { club } = await assertClubAccess(clubSlug, "admin");

  // Kanal-Invariante: kein Apple-Kauf über ein laufendes Stripe-Abo.
  const provider = await getSubscriptionProvider(club.id);
  if (provider === "stripe") {
    return NextResponse.json(
      { error: "channel-conflict", message:
        "Dieser Verein zahlt bereits über die Website. Bitte dort verwalten." },
      { status: 409 }
    );
  }

  let decoded: { productId?: string; originalTransactionId?: string; expiresDate?: number };
  try {
    decoded = (await verifyTransaction(signedTransaction)) as typeof decoded;
  } catch {
    return NextResponse.json({ error: "invalid-signature" }, { status: 401 });
  }

  const planCycle = decoded.productId
    ? appleProductToPlanCycle(decoded.productId)
    : null;
  if (!planCycle || !decoded.originalTransactionId) {
    return NextResponse.json({ error: "unknown-product" }, { status: 400 });
  }

  await syncAppleSubscriptionForClub(club.id, {
    originalTransactionId: decoded.originalTransactionId,
    status: "active",
    billingCycle: planCycle.cycle,
    appleExpiresAt: decoded.expiresDate ? new Date(decoded.expiresDate) : null
  });
  await setTeamLicensesPlanForSubscription(club.id, planCycle.plan);

  return NextResponse.json({ ok: true, plan: planCycle.plan, cycle: planCycle.cycle });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/apple-verify.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/apple/verify/route.ts tests/api/apple-verify.test.ts
git commit -m "feat(iap): /api/apple/verify — Sofort-Verifikation + Kanal-Invariante"
```

---

## Task 9: Async Server-Notifications-Endpoint

**Files:**
- Create: `app/api/apple/notifications/route.ts`
- Test: `tests/api/apple-notifications.test.ts`

> Spiegelt `app/api/stripe/webhook/route.ts`: Dedup (gleiche
> `processed_stripe_events`-Tabelle, Key = notificationUUID), Marker NACH
> Erfolg, Mapping → Status, Club-Lookup über originalTransactionId.

- [ ] **Step 1: Write the failing test**

Create `tests/api/apple-notifications.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/apple/verifier", () => ({
  isAppleIapConfigured: () => true,
  verifyNotification: vi.fn()
}));
vi.mock("@/lib/db/queries/subscriptions", () => ({
  hasStripeEventBeenProcessed: vi.fn(),
  markStripeEventProcessed: vi.fn(),
  getClubIdByOriginalTransactionId: vi.fn(),
  syncAppleSubscriptionForClub: vi.fn(),
  setTeamLicensesPlanForSubscription: vi.fn(),
  setTeamLicensesStatusForClubTeams: vi.fn()
}));

const { verifyNotification } = await import("@/lib/apple/verifier");
const subs = await import("@/lib/db/queries/subscriptions");
const { POST } = await import("@/app/api/apple/notifications/route");

function req(body: unknown) {
  return new Request("https://t.dev/api/apple/notifications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (subs.hasStripeEventBeenProcessed as any).mockResolvedValue(false);
  (subs.markStripeEventProcessed as any).mockResolvedValue(true);
  (subs.getClubIdByOriginalTransactionId as any).mockResolvedValue("club_1");
});

describe("POST /api/apple/notifications", () => {
  it("401 on invalid signature, no write", async () => {
    (verifyNotification as any).mockRejectedValue(new Error("bad sig"));
    const res = await POST(req({ signedPayload: "x" }) as any);
    expect(res.status).toBe(401);
    expect(subs.syncAppleSubscriptionForClub).not.toHaveBeenCalled();
  });

  it("DID_RENEW → active, writes + marks processed", async () => {
    (verifyNotification as any).mockResolvedValue({
      notificationType: "DID_RENEW",
      notificationUUID: "uuid_1",
      data: {
        signedTransactionInfo: {
          productId: "kickpact.pro.monthly",
          originalTransactionId: "otx_1",
          expiresDate: 1800000000000
        }
      }
    });
    const res = await POST(req({ signedPayload: "x" }) as any);
    expect(res.status).toBe(200);
    expect(subs.syncAppleSubscriptionForClub).toHaveBeenCalledWith("club_1",
      expect.objectContaining({ status: "active", originalTransactionId: "otx_1" }));
    expect(subs.markStripeEventProcessed).toHaveBeenCalledWith("uuid_1", "DID_RENEW");
  });

  it("EXPIRED → cancelled + team licenses cancelled", async () => {
    (verifyNotification as any).mockResolvedValue({
      notificationType: "EXPIRED",
      notificationUUID: "uuid_2",
      data: { signedTransactionInfo: {
        productId: "kickpact.pro.monthly", originalTransactionId: "otx_1", expiresDate: 0
      } }
    });
    const res = await POST(req({ signedPayload: "x" }) as any);
    expect(res.status).toBe(200);
    expect(subs.setTeamLicensesStatusForClubTeams).toHaveBeenCalledWith("club_1", "cancelled");
  });

  it("deduplicates an already-processed notificationUUID", async () => {
    (subs.hasStripeEventBeenProcessed as any).mockResolvedValue(true);
    (verifyNotification as any).mockResolvedValue({
      notificationType: "DID_RENEW", notificationUUID: "uuid_1",
      data: { signedTransactionInfo: {
        productId: "kickpact.pro.monthly", originalTransactionId: "otx_1", expiresDate: 0
      } }
    });
    const res = await POST(req({ signedPayload: "x" }) as any);
    expect(res.status).toBe(200);
    expect(subs.syncAppleSubscriptionForClub).not.toHaveBeenCalled();
  });

  it("unknown type → 200, no write", async () => {
    (verifyNotification as any).mockResolvedValue({
      notificationType: "SOME_FUTURE_TYPE", notificationUUID: "uuid_3",
      data: { signedTransactionInfo: {
        productId: "kickpact.pro.monthly", originalTransactionId: "otx_1", expiresDate: 0
      } }
    });
    const res = await POST(req({ signedPayload: "x" }) as any);
    expect(res.status).toBe(200);
    expect(subs.syncAppleSubscriptionForClub).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/apple-notifications.test.ts`
Expected: FAIL — route not found.

- [ ] **Step 3: Implement the route**

Create `app/api/apple/notifications/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { isAppleIapConfigured, verifyNotification } from "@/lib/apple/verifier";
import { mapAppleNotificationToStatus } from "@/lib/billing/apple-notifications";
import { appleProductToPlanCycle } from "@/lib/stripe/pricing";
import {
  hasStripeEventBeenProcessed,
  markStripeEventProcessed,
  getClubIdByOriginalTransactionId,
  syncAppleSubscriptionForClub,
  setTeamLicensesPlanForSubscription,
  setTeamLicensesStatusForClubTeams
} from "@/lib/db/queries/subscriptions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Part B — App Store Server Notifications V2. Spiegelt den Stripe-Webhook:
 * Dedup über dieselbe processed_stripe_events-Tabelle (Key = notificationUUID),
 * Marker erst NACH erfolgreichem Handling (A4-Muster), Mapping → Status.
 */
export async function POST(req: NextRequest) {
  if (!isAppleIapConfigured()) {
    return NextResponse.json({ error: "apple-not-configured" }, { status: 503 });
  }

  let signedPayload: string | undefined;
  try {
    ({ signedPayload } = await req.json());
  } catch {
    return NextResponse.json({ error: "bad-json" }, { status: 400 });
  }
  if (!signedPayload) {
    return NextResponse.json({ error: "missing-payload" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let n: any;
  try {
    n = await verifyNotification(signedPayload);
  } catch (err) {
    console.error("[apple-webhook] signature verification failed:", err);
    return NextResponse.json({ error: "invalid-signature" }, { status: 401 });
  }

  const uuid: string = n.notificationUUID;
  const type: string = n.notificationType;

  if (await hasStripeEventBeenProcessed(uuid)) {
    return NextResponse.json({ received: true, deduplicated: true });
  }

  try {
    const status = mapAppleNotificationToStatus(type);
    if (status) {
      const tx = n.data?.signedTransactionInfo ?? {};
      const otx: string | undefined = tx.originalTransactionId;
      const planCycle = tx.productId ? appleProductToPlanCycle(tx.productId) : null;

      if (otx && planCycle) {
        const clubId = await getClubIdByOriginalTransactionId(otx);
        if (clubId) {
          await syncAppleSubscriptionForClub(clubId, {
            originalTransactionId: otx,
            status,
            billingCycle: planCycle.cycle,
            appleExpiresAt: tx.expiresDate ? new Date(tx.expiresDate) : null
          });
          if (status === "cancelled") {
            await setTeamLicensesStatusForClubTeams(clubId, "cancelled");
          } else if (status === "active") {
            await setTeamLicensesPlanForSubscription(clubId, planCycle.plan);
            await setTeamLicensesStatusForClubTeams(clubId, "active");
          }
        } else {
          console.warn("[apple-webhook] no club for originalTransactionId", otx);
        }
      }
    }
    // Marker erst nach Erfolg (A4). Unbekannte Typen werden ebenfalls markiert.
    await markStripeEventProcessed(uuid, type);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[apple-webhook] handler error", err);
    return NextResponse.json({ error: "handler-failure" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/apple-notifications.test.ts`
Expected: PASS (5 Tests).

- [ ] **Step 5: Commit**

```bash
git add app/api/apple/notifications/route.ts tests/api/apple-notifications.test.ts
git commit -m "feat(iap): /api/apple/notifications — async Server-Notifications (spiegelt Stripe-Webhook)"
```

---

## Task 10: Stripe-Seite der Kanal-Invariante

**Files:**
- Modify: `lib/actions/subscriptions.ts`
- Modify: `app/api/stripe/webhook/route.ts`
- Test: `tests/actions/subscriptions-channel-invariant.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/actions/subscriptions-channel-invariant.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stripe/client", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({})
}));
vi.mock("@/lib/auth/scope", () => ({
  assertClubAccess: vi.fn().mockResolvedValue({ club: { id: "club_1", slug: "x", name: "X" } })
}));
vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockResolvedValue({ email: "a@b.de" })
}));
vi.mock("@/lib/db/queries/subscriptions", () => ({
  getSubscriptionProvider: vi.fn()
}));

const subs = await import("@/lib/db/queries/subscriptions");
const { createCheckoutSession } = await import("@/lib/actions/subscriptions");

beforeEach(() => vi.clearAllMocks());

describe("createCheckoutSession channel invariant", () => {
  it("refuses to start Stripe checkout when provider=apple", async () => {
    (subs.getSubscriptionProvider as any).mockResolvedValue("apple");
    await expect(
      createCheckoutSession({ clubSlug: "x", plan: "pro", cycle: "monthly" })
    ).rejects.toThrow(/App/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/actions/subscriptions-channel-invariant.test.ts`
Expected: FAIL — kein Guard, kommt weiter bis zum Stripe-Call.

- [ ] **Step 3: Add guard to createCheckoutSession**

In `lib/actions/subscriptions.ts`, Import ergänzen:

```ts
import { getSubscriptionProvider } from "@/lib/db/queries/subscriptions";
```

Direkt nach `const { club } = await assertClubAccess(opts.clubSlug, "admin");` (ca. Zeile 49) einfügen:

```ts
  // Part B — Kanal-Invariante: kein Stripe-Checkout, wenn der Club bereits
  // über Apple IAP zahlt (kein Doppel-Abo). Die Abo-Verwaltung läuft dann
  // ausschließlich in der iOS-App / über Apple.
  const existingProvider = await getSubscriptionProvider(club.id);
  if (existingProvider === "apple") {
    throw new Error(
      "Dieser Verein zahlt bereits über die iOS-App (Apple). Bitte das Abo dort verwalten."
    );
  }
```

- [ ] **Step 4: Add guard to the Stripe webhook**

In `app/api/stripe/webhook/route.ts`, im `customer.subscription.created`/`updated`-Case, direkt nach der `clubMatchesCustomer`-Prüfung (ca. Zeile 100), einfügen:

```ts
        // Part B — Kanal-Invariante: ein über Apple zahlender Club wird vom
        // Stripe-Webhook nicht angefasst (defensiv; im Normalfall gibt es für
        // solche Clubs gar kein Stripe-Abo).
        if ((await getSubscriptionProvider(clubId)) === "apple") {
          console.warn("[stripe-webhook] club is apple-managed — ignoring", clubId);
          break;
        }
```

Import oben ergänzen:

```ts
import {
  // ... bestehende Imports
  getSubscriptionProvider
} from "@/lib/db/queries/subscriptions";
```

Außerdem: `syncSubscriptionForClub` setzt aktuell `provider` nicht. Damit Stripe-Käufe sauber als `provider='stripe'` markiert werden, in `lib/db/queries/subscriptions.ts` `syncSubscriptionForClub` um `provider: "stripe"` im `.set({...})` erweitern (additive Änderung, bestehende Stripe-Tests bleiben grün).

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/actions/subscriptions-channel-invariant.test.ts tests/api/stripe-webhook.test.ts`
Expected: PASS (neuer Test + bestehende Webhook-Tests, da Guard nur bei provider=apple greift; in den Bestands-Tests ist provider null → kein break).

> Falls ein bestehender Webhook-Test jetzt `getSubscriptionProvider` nicht
> gemockt hat und an einer DB hängt: den Mock dort ergänzen
> (`getSubscriptionProvider: vi.fn().mockResolvedValue(null)`). Das ist eine
> Test-Anpassung, kein Logik-Bug.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/subscriptions.ts app/api/stripe/webhook/route.ts lib/db/queries/subscriptions.ts tests/actions/subscriptions-channel-invariant.test.ts
git commit -m "feat(iap): Stripe-Seite der Kanal-Invariante (Checkout + Webhook + provider=stripe)"
```

---

## Task 11: <UpgradeGate>-Komponente

**Files:**
- Create: `components/billing/upgrade-gate.tsx`
- Test: `tests/components/upgrade-gate.test.tsx`

> Reine Darstellungs-Komponente, channel-aware. Bekommt den Ziel-Plan + Trigger
> als Props; entscheidet via `getCheckoutChannel()`, welcher CTA gezeigt wird.
> Die Verdrahtung an die 3 Trigger-Punkte (Cap-Error, Trial-Banner, Read-Only)
> erfolgt beim Einbau in die jeweiligen Seiten — hier nur die Komponente + Logik.

- [ ] **Step 1: Write the failing test**

Create `tests/components/upgrade-gate.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

afterEach(() => vi.resetAllMocks());

vi.mock("@/lib/billing/checkout-channel", () => ({
  getCheckoutChannel: vi.fn()
}));

const { getCheckoutChannel } = await import("@/lib/billing/checkout-channel");
const { UpgradeGate } = await import("@/components/billing/upgrade-gate");

describe("<UpgradeGate>", () => {
  it("shows the target plan headline + highlights", () => {
    (getCheckoutChannel as any).mockReturnValue("stripe");
    render(<UpgradeGate targetPlan="pro" trigger="cap" />);
    expect(screen.getByText(/ohne Limits|unbegrenzt/i)).toBeInTheDocument();
  });

  it("renders the Apple CTA inside the iOS app", () => {
    (getCheckoutChannel as any).mockReturnValue("apple");
    render(<UpgradeGate targetPlan="pro" trigger="cap" />);
    expect(screen.getByRole("button", { name: /upgrade|freischalten|aktivieren/i }))
      .toBeInTheDocument();
    // Kein Stripe/Web-Preis-Text im iOS-Kontext (Anti-Steering)
    expect(screen.queryByText(/€\s*\/\s*Monat/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/upgrade-gate.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement the component**

Create `components/billing/upgrade-gate.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { PlanKey } from "@/lib/stripe/pricing";
import { FEATURE_BY_PLAN } from "@/lib/billing/plan-features";
import { getCheckoutChannel } from "@/lib/billing/checkout-channel";
import { purchase } from "@/lib/platform/iap";
import { createCheckoutSession } from "@/lib/actions/subscriptions";
import { Button } from "@/components/ui/button";

type Trigger = "cap" | "trial" | "readonly";

const PRODUCT_BY_PLAN: Record<PlanKey, string> = {
  basic: "kickpact.basic.monthly",
  pro: "kickpact.pro.monthly",
  verein: "kickpact.verein.monthly"
};

/**
 * Part B — channel-aware Upgrade-Aufforderung. iOS → StoreKit-Sheet,
 * Web → Stripe-Checkout. Auf iOS werden bewusst KEINE Web-Preise gezeigt
 * (Apple Anti-Steering); die Preise kommen dort aus dem nativen Sheet.
 */
export function UpgradeGate(props: {
  targetPlan: PlanKey;
  trigger: Trigger;
  clubSlug?: string;
}) {
  const { targetPlan, clubSlug } = props;
  const feature = FEATURE_BY_PLAN[targetPlan];
  const channel = getCheckoutChannel();
  const [busy, setBusy] = useState(false);

  async function onUpgrade() {
    setBusy(true);
    try {
      if (channel === "apple") {
        await purchase(PRODUCT_BY_PLAN[targetPlan]);
        // Nach erfolgreichem Kauf: Seite neu laden, damit das Gate verschwindet.
        window.location.reload();
      } else if (clubSlug) {
        const { url } = await createCheckoutSession({
          clubSlug, plan: targetPlan, cycle: "monthly"
        });
        window.location.href = url;
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-5">
      <h3 className="text-lg font-semibold">{feature.upgradeHeadline}</h3>
      <ul className="mt-3 space-y-1 text-sm text-neutral-700">
        {feature.highlights.map((h) => (
          <li key={h}>• {h}</li>
        ))}
      </ul>
      <Button className="mt-4" onClick={onUpgrade} disabled={busy}>
        {channel === "apple" ? "Jetzt freischalten" : "Upgrade wählen"}
      </Button>
    </div>
  );
}
```

> **Hinweis:** `lib/platform/iap.ts` (`purchase`) entsteht erst in Task 12. Bis
> dahin reicht ein web-inerter Stub, der auf Web nie aufgerufen wird (channel
> ist dort "stripe"). Falls Task 12 noch nicht existiert, in Task 11 zuerst den
> Stub aus Task 12 Step 3 anlegen, damit der Import auflöst.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/upgrade-gate.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/billing/upgrade-gate.tsx tests/components/upgrade-gate.test.tsx
git commit -m "feat(iap): <UpgradeGate> — channel-aware Upgrade-Aufforderung"
```

---

## Task 12: TS-Bridge zum nativen IAP-Plugin

**Files:**
- Create: `lib/platform/iap.ts`
- Test: `tests/billing/iap-bridge.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/billing/iap-bridge.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => vi.unstubAllGlobals());

describe("iap bridge (web-inert)", () => {
  it("purchase throws a clear error on web", async () => {
    vi.stubGlobal("window", { navigator: { userAgent: "Safari" } });
    vi.resetModules();
    const { purchase } = await import("@/lib/platform/iap");
    await expect(purchase("kickpact.pro.monthly")).rejects.toThrow(/App/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/billing/iap-bridge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the bridge**

Create `lib/platform/iap.ts`:

```ts
import { isIOSApp } from "@/lib/platform/native";

/**
 * Part B — TS-Bridge zum nativen Capacitor-IAP-Plugin (Task: IAPPlugin.swift).
 * Web-inert: auf Web/SSR wirft jede Methode einen klaren Fehler (der Aufrufer
 * ist im iOS-Kontext über getCheckoutChannel() abgesichert).
 */

interface IAPPluginShape {
  getProducts(opts: { productIds: string[] }): Promise<{ products: AppleProduct[] }>;
  purchase(opts: { productId: string }): Promise<AppleTransaction>;
  restore(): Promise<{ restored: AppleTransaction[] }>;
}

export interface AppleProduct {
  productId: string;
  displayName: string;
  displayPrice: string;
}
export interface AppleTransaction {
  originalTransactionId: string;
  jwsRepresentation: string;
}

function plugin(): IAPPluginShape {
  // Capacitor registriert native Plugins unter window.Capacitor.Plugins.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (window as any)?.Capacitor?.Plugins?.IAPPlugin;
  if (!isIOSApp() || !p) {
    throw new Error("In-App-Käufe sind nur in der iOS-App verfügbar.");
  }
  return p as IAPPluginShape;
}

export async function getProducts(productIds: string[]): Promise<AppleProduct[]> {
  const { products } = await plugin().getProducts({ productIds });
  return products;
}

/** Startet das native StoreKit-Sheet; gibt das signierte JWS zurück. */
export async function purchase(productId: string): Promise<AppleTransaction> {
  return plugin().purchase({ productId });
}

export async function restore(): Promise<AppleTransaction[]> {
  const { restored } = await plugin().restore();
  return restored;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/billing/iap-bridge.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire purchase → verify endpoint**

Ergänze in `lib/platform/iap.ts` eine Convenience, die Kauf + Server-Verify bündelt (genutzt vom `<UpgradeGate>`):

```ts
/** Kauf + sofortige Server-Verifikation in einem Schritt. */
export async function purchaseAndVerify(
  productId: string,
  clubSlug: string
): Promise<void> {
  const tx = await purchase(productId);
  const res = await fetch("/api/apple/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clubSlug, signedTransaction: tx.jwsRepresentation })
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? "Kauf konnte nicht verifiziert werden.");
  }
}
```

Passe `<UpgradeGate>` (Task 11) an, im Apple-Zweig `purchaseAndVerify(PRODUCT_BY_PLAN[targetPlan], clubSlug!)` statt nur `purchase(...)` aufzurufen.

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run tests/billing/iap-bridge.test.ts tests/components/upgrade-gate.test.tsx && npx tsc --noEmit`
Expected: PASS, 0 Type-Errors.

- [ ] **Step 7: Commit**

```bash
git add lib/platform/iap.ts components/billing/upgrade-gate.tsx tests/billing/iap-bridge.test.ts
git commit -m "feat(iap): TS-Bridge zum nativen IAP-Plugin + purchaseAndVerify"
```

---

## Task 13: Native Swift-Plugin (Xcode)

**Files:**
- Create: `ios/App/App/IAPPlugin.swift`
- Create: `ios/App/App/IAPPlugin.m`

> **Kein Vitest** — dieses Plugin wird auf einem echten Gerät/TestFlight getestet
> (Task 14). Hier nur die Implementierung + `cap sync`.

- [ ] **Step 1: Create the Objective-C bridge**

Create `ios/App/App/IAPPlugin.m`:

```objc
#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(IAPPlugin, "IAPPlugin",
  CAP_PLUGIN_METHOD(getProducts, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(purchase, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(restore, CAPPluginReturnPromise);
)
```

- [ ] **Step 2: Create the Swift plugin (StoreKit 2)**

Create `ios/App/App/IAPPlugin.swift`:

```swift
import Foundation
import Capacitor
import StoreKit

@objc(IAPPlugin)
public class IAPPlugin: CAPPlugin {

  @objc func getProducts(_ call: CAPPluginCall) {
    guard let ids = call.getArray("productIds", String.self) else {
      call.reject("productIds required"); return
    }
    Task {
      do {
        let products = try await Product.products(for: ids)
        let mapped = products.map { p -> [String: Any] in
          ["productId": p.id, "displayName": p.displayName, "displayPrice": p.displayPrice]
        }
        call.resolve(["products": mapped])
      } catch { call.reject("getProducts failed: \(error)") }
    }
  }

  @objc func purchase(_ call: CAPPluginCall) {
    guard let productId = call.getString("productId") else {
      call.reject("productId required"); return
    }
    Task {
      do {
        let products = try await Product.products(for: [productId])
        guard let product = products.first else { call.reject("product not found"); return }
        let result = try await product.purchase()
        switch result {
        case .success(let verification):
          switch verification {
          case .verified(let transaction):
            // jwsRepresentation = signiertes JWS für die Server-Verifikation.
            let jws = verification.jwsRepresentation
            await transaction.finish()
            call.resolve([
              "originalTransactionId": String(transaction.originalID),
              "jwsRepresentation": jws
            ])
          case .unverified:
            call.reject("transaction unverified")
          }
        case .userCancelled: call.reject("cancelled")
        case .pending: call.reject("pending")
        @unknown default: call.reject("unknown purchase result")
        }
      } catch { call.reject("purchase failed: \(error)") }
    }
  }

  @objc func restore(_ call: CAPPluginCall) {
    Task {
      var restored: [[String: Any]] = []
      for await result in Transaction.currentEntitlements {
        if case .verified(let transaction) = result {
          restored.append([
            "originalTransactionId": String(transaction.originalID),
            "jwsRepresentation": result.jwsRepresentation
          ])
        }
      }
      call.resolve(["restored": restored])
    }
  }
}
```

- [ ] **Step 3: Sync Capacitor**

Run (mit UTF-8-Locale wegen pod-install-Falle, siehe native-setup-credentials.md):
```bash
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 && npx cap sync ios
```
Expected: Plugin im Xcode-Projekt registriert, `pod install` ohne Encoding-Fehler.

- [ ] **Step 4: Commit**

```bash
git add ios/App/App/IAPPlugin.swift ios/App/App/IAPPlugin.m ios/
git commit -m "feat(iap): natives StoreKit-2-Capacitor-Plugin (getProducts/purchase/restore)"
```

---

## Task 14: Integration der 3 Trigger-Punkte + Voll-Verifikation

**Files:**
- Modify: Cap-Error-Handling (Stelle, an der `PlanCapExceededError` im UI ankommt)
- Modify: Vereins-Layout (Trial-Banner + Read-Only)
- Anti-Steering: Preise-Seite + Abo-Seite

> Die genauen Einbau-Stellen ergeben sich aus der bestehenden UI. Vorgehen:
> jeweils die Stelle finden, dann `<UpgradeGate>` bzw. `isNativeAppRequest()`-Gate
> einsetzen.

- [ ] **Step 1: Cap-Trigger — wo PlanCapExceededError landet**

Run: `grep -rn "PlanCapExceededError\|plan_cap_exceeded" app components lib --include=*.tsx --include=*.ts | grep -v test`
Erwartung: Server-Action/Route, die den Fehler wirft, + UI-Stelle, die ihn fängt.
An der UI-Stelle bei gefangenem Cap-Error `<UpgradeGate targetPlan="pro" trigger="cap" clubSlug={slug} />` rendern statt eines reinen Toasts.

- [ ] **Step 2: Trial + Read-Only-Trigger im Vereins-Layout**

Run: `grep -rn "getSubscriptionGate\|isReadOnly\|daysUntilReadOnly" app --include=*.tsx | grep -v test`
Im Vereins-Layout (das den Gate bereits lädt): wenn `gate.reason === "trial_expired"` ODER `gate.daysUntilReadOnly !== null && gate.daysUntilReadOnly <= 3` → Countdown-Banner mit `<UpgradeGate ... trigger="trial" />`. Bei `gate.isReadOnly` → Banner mit `trigger="readonly"`.

- [ ] **Step 3: Anti-Steering auf Preise-/Abo-Seiten**

Run: `grep -rln "createCheckoutSession\|/preise\|PriceCard\|saveBadge" app components --include=*.tsx | grep -v test`
Auf jeder Seite, die Web-Preise/Stripe-CTAs zeigt: in Server Components mit `await isNativeAppRequest()` (aus `lib/platform/native-server.ts`) gaten — im iOS-Kontext die Stripe-CTAs + Web-Preis-Vergleiche NICHT rendern, stattdessen `<UpgradeGate>`-Pfad. Client Components nutzen `getCheckoutChannel()`.

- [ ] **Step 4: Full test sweep (batchweise)**

Run:
```bash
npx vitest run tests/billing tests/stripe tests/api tests/actions tests/components tests/queries
```
Expected: Alle neuen + bestehenden Tests grün. (Voll-Lauf nur batchweise — singleFork über alles OOMt, siehe STATE.md.)

- [ ] **Step 5: Typecheck + Lint**

Run: `npx tsc --noEmit`
Expected: 0 Errors.

- [ ] **Step 6: Adversarial Review**

Subagent `adversarial-reviewer` über das Gesamt-Diff laufen lassen (Fokus:
Kanal-Invariante wirklich an BEIDEN Stellen, JWS-Verify nie umgehbar,
Read-Only blockt Schreib-Pfade, Anti-Steering lückenlos). Befunde fixen.

- [ ] **Step 7: Commit + Push + PR**

```bash
git add -A
git commit -m "feat(iap): 3 Upgrade-Trigger verdrahtet + Anti-Steering auf Preis-Seiten"
git push -u origin feat/apple-iap-entitlements
gh pr create --title "Apple IAP + Entitlement-Gating (Pricing Part B)" --body "Setzt docs/superpowers/specs/2026-06-16-apple-iap-entitlements-design.md um."
```

---

## Manuelle Abnahme (nach Merge, TestFlight)

> Kein Vitest möglich — echtes Gerät nötig. Checkliste für Johannes:

- [ ] Start-Preise im ASC-UI gesetzt (6 Produkte).
- [ ] Server-Notification-URL in ASC eingetragen → `/api/apple/notifications` (Sandbox + Prod).
- [ ] `APPLE_IAP_*`-Env in Coolify gesetzt (BUNDLE_ID, ENV, APP_APPLE_ID, ROOT_CERTS).
- [ ] TestFlight-Build mit IAPPlugin installiert.
- [ ] Sandbox-Kauf je Plan → Entitlement aktiv, korrekter Plan im Vereins-Cockpit.
- [ ] `restore()` nach Neuinstallation stellt das Abo wieder her.
- [ ] Sandbox-Refund (ASC) → Club geht in Read-Only, Schreib-Buttons zeigen Gate.
- [ ] Visuell: in der iOS-App KEINE Web-Preise / Stripe-CTAs sichtbar.
- [ ] Web unverändert: Stripe-Checkout funktioniert weiter.
