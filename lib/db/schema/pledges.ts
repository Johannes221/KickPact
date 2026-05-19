import {
  pgTable, text, timestamp, integer, boolean, jsonb, pgEnum, index
} from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { sponsors } from "./sponsors";
import { teams } from "./clubs";

export const pledgeStatusEnum = pgEnum("pledge_status", ["active", "paused", "ended"]);

export const triggerTypeEnum = pgEnum("trigger_type", [
  "goal_total",
  "goal_by_player",
  "win",
  "loss",
  "draw",
  "clean_sheet",
  "comeback_win",
  "hattrick",
  "goal_diff_min",
  "goals_scored_min",
  "special_goal",
  "yellow_card",
  "red_card",
  "assist",
  "man_of_match",
  "custom"
]);

export const pledges = pgTable(
  "pledges",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    sponsorId: text("sponsor_id").notNull().references(() => sponsors.id, { onDelete: "cascade" }),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    status: pledgeStatusEnum("status").notNull().default("active"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    monthlyCapCents: integer("monthly_cap_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    sponsorIdx: index("pledges_sponsor_idx").on(t.sponsorId),
    teamIdx: index("pledges_team_idx").on(t.teamId)
  })
);

export const pledgeRules = pgTable(
  "pledge_rules",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    pledgeId: text("pledge_id").notNull().references(() => pledges.id, { onDelete: "cascade" }),
    triggerType: triggerTypeEnum("trigger_type").notNull(),
    triggerParamsJson: jsonb("trigger_params_json").$type<Record<string, unknown>>().default({}),
    amountCents: integer("amount_cents").notNull(),
    perMatchCapCents: integer("per_match_cap_cents"),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    pledgeIdx: index("pledge_rules_pledge_idx").on(t.pledgeId)
  })
);
