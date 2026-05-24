import { pgTable, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { clubs, teams } from "./clubs";

export const planEnum = pgEnum("plan", ["basic", "pro"]);

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "incomplete"
]);

export const licenseStatusEnum = pgEnum("license_status", [
  "trialing",
  "active",
  "past_due",
  "cancelled",
  "read_only"
]);

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
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
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
    activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true })
  },
  (t) => ({
    statusIdx: index("team_licenses_status_idx").on(t.status)
  })
);
