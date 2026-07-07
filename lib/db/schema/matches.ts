import {
  pgTable, text, timestamp, integer, pgEnum, index
} from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { teams, players } from "./clubs";
import { users } from "./auth";
import { pledgeRules } from "./pledges";

export const matchStatusEnum = pgEnum("match_status", [
  "scheduled",
  "live",
  "finished",
  "cancelled",
  "postponed"
]);

export const eventTypeEnum = pgEnum("event_type", [
  "tor",
  "auswechslung",
  "spezial",
  "karte"
]);

export const eventSideEnum = pgEnum("event_side", ["heim", "gast"]);

export const eventSourceEnum = pgEnum("event_source", ["scraped", "manual"]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "confirmed",
  "disputed",
  "expired"
]);

export const matches = pgTable(
  "matches",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    fussballdeSpielId: text("fussballde_spiel_id").notNull().unique(),
    datum: timestamp("datum", { withTimezone: true }).notNull(),
    heimName: text("heim_name").notNull(),
    gastName: text("gast_name").notNull(),
    /**
     * Eindeutige fussball.de-team-id der Heim-/Gast-Mannschaft (aus der Spiel-
     * Detailseite). Mit ihr bestimmt `resolveTeamSide` die eigene Spielseite
     * DETERMINISTISCH — Namens-Matching kollidiert bei Reserve-Derbys / gleicher
     * Stadt und wertet dann die falsche Seite (stilles Falschgeld). NULL für
     * Alt-Matches (vor der Spalte) und scheduled-Stubs (Listen-Item ohne id) →
     * dort fällt resolveTeamSide auf das Namens-Matching zurück.
     */
    heimTeamId: text("heim_team_id"),
    gastTeamId: text("gast_team_id"),
    ergebnisHeim: integer("ergebnis_heim"),
    ergebnisGast: integer("ergebnis_gast"),
    halbzeitHeim: integer("halbzeit_heim"),
    halbzeitGast: integer("halbzeit_gast"),
    status: matchStatusEnum("status").notNull().default("scheduled"),
    /**
     * Stable hash over (result, halftime, events). Set by the crawler so re-runs
     * can detect when fussball.de data has changed and we need to invalidate
     * downstream charges. NULL for pre-existing matches inserted before the
     * column landed — they'll be backfilled on the next successful crawl.
     */
    contentHash: text("content_hash"),
    /** Human-readable reason if the match was cancelled (e.g. "match_updated"). */
    cancelledReason: text("cancelled_reason"),
    /**
     * Plan 3 Teil 2: Audit-Trail für manuelle Admin-Eingriffe am Match.
     *
     * JSON-Array von Audit-Einträgen — append-only. Jeder Eintrag dokumentiert
     * was geändert wurde, von wem, wann, mit dem Original-Snapshot:
     *
     *   [{
     *     kind: "event-deleted" | "result-override" | "event-edited",
     *     at:   ISO-Date-String,
     *     byUserId: string,
     *     snapshot: object,   // Original-Werte vor der Aktion
     *     reason?: string     // optional (z.B. bei result-override)
     *   }, ...]
     *
     * Wird vom Match-Detail-Page (Read-Only-Anzeige) als "Admin-Korrekturen"
     * gerendert. Schema ist absichtlich frei (JSON), weil die einzelnen
     * Action-Typen unterschiedliche Snapshot-Shapes brauchen.
     */
    adminNote: text("admin_note"),
    crawledAt: timestamp("crawled_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    teamDatumIdx: index("matches_team_datum_idx").on(t.teamId, t.datum)
  })
);

export const matchEvents = pgTable(
  "match_events",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    matchId: text("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    minute: integer("minute"),
    type: eventTypeEnum("type").notNull(),
    subtype: text("subtype"),
    side: eventSideEnum("side").notNull(),
    playerName: text("player_name"),
    playerId: text("player_id").references(() => players.id, { onDelete: "set null" }),
    source: eventSourceEnum("source").notNull(),
    reportedByUserId: text("reported_by_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    matchIdx: index("match_events_match_idx").on(t.matchId),
    matchTypeIdx: index("match_events_match_type_idx").on(t.matchId, t.type)
  })
);

export const eventApprovals = pgTable(
  "event_approvals",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    matchEventId: text("match_event_id")
      .notNull()
      .references(() => matchEvents.id, { onDelete: "cascade" }),
    pledgeRuleId: text("pledge_rule_id")
      .notNull()
      .references(() => pledgeRules.id, { onDelete: "cascade" }),
    status: approvalStatusEnum("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    disputeReason: text("dispute_reason"),
    reminderCount: integer("reminder_count").notNull().default(0),
    lastRemindedAt: timestamp("last_reminded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    pendingIdx: index("event_approvals_pending_idx").on(t.pledgeRuleId, t.status, t.expiresAt)
  })
);
