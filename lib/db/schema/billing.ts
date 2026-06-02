import { pgTable, text, timestamp, pgEnum, index, type AnyPgColumn } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { clubs, teams } from "./clubs";

// Pricing v2: 3 Tiers (basic / pro / verein) – siehe docs/pricing.md §1.
export const planEnum = pgEnum("plan", ["basic", "pro", "verein"]);

// Pricing v2: Billing-Cycles. Default monatlich.
// 2026-05-28: 'season' → 'season_end' (spec-konform, Migration 0028).
// 2026-06-02: 'annual' aus dem App-Code entfernt (Saison-Pass = Jahres-Bindung).
//   Der Enum-WERT bleibt hier inert bestehen — Postgres kann Enum-Werte nicht
//   gefahrlos droppen, und kein App-Code erzeugt mehr 'annual'. Reads werden via
//   normalizeBillingCycle() (lib/stripe/pricing.ts) abgefangen.
export const billingCycleEnum = pgEnum("billing_cycle", [
  "monthly",
  "season_end",
  "annual"
]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "incomplete",
  // Pricing v2: Saison-Pass in Sommerpause (Jun/Jul). Kein Charge, kein Crawler.
  "paused"
]);

export const licenseStatusEnum = pgEnum("license_status", [
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "read_only",
  // Pricing v2: Team-License-Status spiegelt Saison-Pass-Pause.
  "paused"
]);

/**
 * SECURITY (H1): Trial-Abuse-Ledger. Hält fest, welche stabile Identität schon
 * einen kostenlosen Trial verbraucht hat — Key-Format `team:<fussballdeTeamId>`
 * oder `verein:<fussballdeVereinId>`. createDraftClub prüft das VOR der
 * Trial-Vergabe; ohne diesen Ledger ließ sich der 30-Tage-Trial durch
 * Verwerfen+Neu-Onboarden derselben Mannschaft beliebig oft neu starten.
 */
export const consumedTrials = pgTable("consumed_trials", {
  key: text("key").primaryKey(),
  clubId: text("club_id"),
  consumedAt: timestamp("consumed_at", { withTimezone: true }).notNull().defaultNow()
});

export const subscriptions = pgTable("subscriptions", {
  clubId: text("club_id")
    .primaryKey()
    .references(() => clubs.id, { onDelete: "cascade" }),
  // Erlaubt NULL bis zum ersten echten Stripe-Checkout. Beim Onboarding
  // wird nur ein subscriptions-Row angelegt, der echte Customer entsteht
  // lazy in createCheckoutSession (lib/actions/subscriptions.ts).
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  status: subscriptionStatusEnum("status").notNull().default("trialing"),
  // Pricing v2: Billing-Cycle pro Subscription (monthly|season_end; 'annual' inert, s.o.).
  billingCycle: billingCycleEnum("billing_cycle").notNull().default("monthly"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  // Pricing v2: Während Sommerpause (Saison-Pass) bis zu welchem Datum pausiert.
  pausedUntil: timestamp("paused_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const teamLicenses = pgTable(
  "team_licenses",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    subscriptionClubId: text("subscription_club_id")
      .notNull()
      .references(() => subscriptions.clubId, { onDelete: "cascade" }),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }).unique(),
    plan: planEnum("plan").notNull().default("basic"),
    stripeSubscriptionItemId: text("stripe_subscription_item_id"),
    status: licenseStatusEnum("status").notNull().default("trialing"),
    // Pricing v2: Vereinslizenz-Bündelung — Master-License referenziert alle
    // Team-Licenses unter ihr, ist self-referencing nullable.
    parentClubLicenseId: text("parent_club_license_id").references(
      (): AnyPgColumn => teamLicenses.id,
      { onDelete: "set null" }
    ),
    activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true })
  },
  (t) => ({
    statusIdx: index("team_licenses_status_idx").on(t.status),
    parentIdx: index("team_licenses_parent_idx").on(t.parentClubLicenseId)
  })
);
