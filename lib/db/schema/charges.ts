import {
  pgTable, text, timestamp, integer, pgEnum, index, uniqueIndex
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { pledges, pledgeRules, triggerTypeEnum } from "./pledges";
import { matches, matchEvents } from "./matches";
import { sponsors } from "./sponsors";
import { clubs } from "./clubs";

export const chargeStatusEnum = pgEnum("charge_status", [
  "pending_approval",
  "confirmed",
  "invoiced",
  "cancelled"
]);

export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "sent", "paid"]);

export const charges = pgTable(
  "charges",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    pledgeId: text("pledge_id").notNull().references(() => pledges.id, { onDelete: "cascade" }),
    pledgeRuleId: text("pledge_rule_id")
      .notNull()
      .references(() => pledgeRules.id, { onDelete: "cascade" }),
    /**
     * matchId ist NULL für Saison-Wetten-Charges (die fallen erst am Saison-Ende an,
     * nicht pro Spiel). Per-Spiel-Charges haben hier weiterhin eine matchId.
     */
    matchId: text("match_id").references(() => matches.id, { onDelete: "cascade" }),
    matchEventId: text("match_event_id").references(() => matchEvents.id, { onDelete: "set null" }),
    /**
     * Für Saison-Charges: welche Saison gemeint ist. Format wie teams.saison
     * ("2025/26"). Garantiert Idempotenz bei evaluate-season-Re-Runs.
     */
    saison: text("saison"),
    triggerType: triggerTypeEnum("trigger_type").notNull(),
    amountCents: integer("amount_cents").notNull(),
    status: chargeStatusEnum("status").notNull().default("confirmed"),
    invoiceId: text("invoice_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true })
  },
  (t) => ({
    pledgeStatusIdx: index("charges_pledge_status_idx").on(t.pledgeId, t.status),
    uniqueEvent: uniqueIndex("charges_unique_event_idx")
      .on(t.pledgeRuleId, t.matchEventId)
      .where(sql`${t.matchEventId} IS NOT NULL`),
    uniqueMatchTrigger: uniqueIndex("charges_unique_match_trigger_idx")
      .on(t.pledgeRuleId, t.matchId, t.triggerType)
      .where(sql`${t.matchEventId} IS NULL AND ${t.matchId} IS NOT NULL`),
    // Saison-Charge: 1× pro pledge_rule + saison
    uniqueSeason: uniqueIndex("charges_unique_season_idx")
      .on(t.pledgeRuleId, t.saison)
      .where(sql`${t.saison} IS NOT NULL`)
  })
);

export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    sponsorId: text("sponsor_id").notNull().references(() => sponsors.id, { onDelete: "cascade" }),
    clubId: text("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    totalCents: integer("total_cents").notNull(),
    pdfUrl: text("pdf_url"),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidMarkedAt: timestamp("paid_marked_at", { withTimezone: true }),
    paidMarkedBy: text("paid_marked_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    uniqueSponsorPeriod: uniqueIndex("invoices_sponsor_club_period_idx").on(
      t.sponsorId,
      t.clubId,
      t.period
    )
  })
);

export const invoiceItems = pgTable("invoice_items", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  chargeId: text("charge_id").notNull().references(() => charges.id, { onDelete: "restrict" }),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull()
});
