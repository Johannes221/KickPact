import {
  pgTable, text, timestamp, integer, boolean, jsonb, pgEnum, index, uniqueIndex
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { sponsors } from "./sponsors";
import { teams } from "./clubs";

export const pledgeStatusEnum = pgEnum("pledge_status", ["active", "paused", "ended"]);

export const triggerTypeEnum = pgEnum("trigger_type", [
  // Per-Spiel Auto-Trigger (von Fußball.de)
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
  // Per-Spiel manuelle Trigger (Mannschaft meldet, Sponsor bestätigt)
  "special_goal",
  "yellow_card",
  "red_card",
  "assist",
  "man_of_match",
  "custom",
  // Saison-Wetten (1× pro Saison, evaluiert am Saison-Ende)
  "season_promotion",
  "season_no_relegation",
  "season_table_position",
  "season_champion",
  "season_cup_round",
  "season_custom"
]);

/**
 * Klassifiziert ob ein Trigger pro Spiel feuern soll oder erst am Saison-Ende.
 * Wird vom Inngest-Job evaluate-match (pro Match) bzw. evaluate-season (1×)
 * genutzt.
 */
export const SEASON_TRIGGERS = [
  "season_promotion",
  "season_no_relegation",
  "season_table_position",
  "season_champion",
  "season_cup_round",
  "season_custom"
] as const;

export type SeasonTriggerType = (typeof SEASON_TRIGGERS)[number];

export function isSeasonTrigger(t: string): t is SeasonTriggerType {
  return (SEASON_TRIGGERS as readonly string[]).includes(t);
}

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
    /**
     * Herkunft bei Saison-Renewal: ID der Vorgänger-Pledge, aus der diese
     * Pledge geklont wurde (Review K3 2026-06-11). Idempotenz-Anker für
     * clonePledgeForNextSeason — die alte Heuristik „existiert eine Pledge
     * (sponsor, team) mit endsAt > original.endsAt" verschluckte das Renewal
     * des ZWEITEN Pacts desselben Sponsors auf demselben Team.
     */
    clonedFromPledgeId: text("cloned_from_pledge_id"),
    /**
     * True when this pledge was auto-paused by the Sommerpause cron (June 1).
     * The resume cron (August 1) only un-pauses pledges with this flag set,
     * so manually-paused pledges are never accidentally resumed.
     */
    sommerpausePaused: boolean("sommerpause_paused").notNull().default(false),
    /**
     * Zeitpunkt der letzten manuellen Pause durch den Sponsor (NULL = nicht
     * manuell pausiert). Spiele mit datum < pausedAt werden weiter abgerechnet
     * (analog H4c für ended) — eine Pause nach Abpfiff, vor dem Scrape, darf
     * die Charge des bereits gespielten Spiels nicht unterdrücken.
     * Sommerpause-Pausen setzen pausedAt NICHT (Erkennung via sommerpausePaused).
     */
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    sponsorIdx: index("pledges_sponsor_idx").on(t.sponsorId),
    teamIdx: index("pledges_team_idx").on(t.teamId),
    // Review-Auflage 1 (2026-06-12): Race-Schutz für das Renewal — zwei
    // parallele confirmSeasonRenewal-Requests (Mail-Link in zwei Tabs)
    // passieren sonst beide den SELECT-Idempotenz-Check und erzeugen zwei
    // aktive Clones inkl. Rules → doppelte Beiträge die ganze Saison.
    clonedFromUniqueIdx: uniqueIndex("pledges_cloned_from_unique_idx")
      .on(t.clonedFromPledgeId)
      .where(sql`${t.clonedFromPledgeId} IS NOT NULL`)
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
    /** @deprecated Pro-Spiel-Cap. Abgelöst durch capCents+capPeriod (Migration 0040). */
    perMatchCapCents: integer("per_match_cap_cents"),
    /** Optionaler Cap-Betrag pro Wette (in Cent), begrenzt pro `capPeriod`. */
    capCents: integer("cap_cents"),
    /** Cap-Periode für `capCents`: pro Kalendermonat oder pro Saison. Nur Spiel-Wetten. */
    capPeriod: text("cap_period").$type<"month" | "season">(),
    /** Soft-Delete: false = vom Sponsor gelöscht. Vergangene Charges bleiben erhalten. */
    active: boolean("active").notNull().default(true),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    /**
     * SECURITY (H4): Term-Versionierung. Eine Wette gilt für Spiele mit
     * `effectiveFrom <= matchDate < effectiveUntil` (effectiveUntil=NULL = offen).
     * Default ist die Unix-Epoche → bestehende/neu angelegte Regeln sind „schon
     * immer" gültig (kein Verhaltenswechsel). Wird ein Betrag/Cap REDUZIERT,
     * klont updatePledgeRule die Regel: die alte bekommt effectiveUntil=jetzt
     * (gilt weiter für bereits gespielte Spiele zu den alten Konditionen), die
     * neue startet mit effectiveFrom=jetzt zu den reduzierten Konditionen.
     * Verhindert, dass ein Sponsor nach Anpfiff (aber vor dem Scrape) den Betrag
     * senkt und so bereits gespielte Spiele rückwirkend billiger macht.
     */
    effectiveFrom: timestamp("effective_from", { withTimezone: true })
      .notNull()
      .default(sql`'1970-01-01T00:00:00Z'`),
    effectiveUntil: timestamp("effective_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    pledgeIdx: index("pledge_rules_pledge_idx").on(t.pledgeId)
  })
);
