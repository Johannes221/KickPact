import { pgTable, text, timestamp, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { teams } from "./clubs";

/**
 * End-Saison-Ergebnisse einer Mannschaft. Wird vom Inngest-Job `evaluate-season`
 * gegen Fußball.de gefüttert + von evaluate-season für Saison-Wetten-Auswertung gelesen.
 *
 * Format saison: "2025/26" (wie teams.saison).
 *
 * Manche Felder können null sein wenn der Crawler noch nicht alle Daten hat
 * oder die Liga keinen Aufstieg/Abstieg hat.
 */
export const seasonResults = pgTable(
  "season_results",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    saison: text("saison").notNull(),
    /** End-Tabellenplatz (1 = Meister) */
    finalPosition: integer("final_position"),
    /** Total Teams in der Liga (für relative Bewertung) */
    teamsInLeague: integer("teams_in_league"),
    /** Auf-/abgestiegen */
    promoted: boolean("promoted").notNull().default(false),
    relegated: boolean("relegated").notNull().default(false),
    /** Erreichte Pokal-Runde — "vorrunde" | "achtelfinale" | "viertelfinale" | "halbfinale" | "finale" | "sieger" */
    cupRoundReached: text("cup_round_reached"),
    /** Optional: Custom-Notiz vom Verein für season_custom-Trigger */
    customNotes: text("custom_notes"),
    /** Wann das Ergebnis final war (Saison-Schluss-Pfiff) */
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    uniqueTeamSaison: uniqueIndex("season_results_team_saison_idx").on(t.teamId, t.saison)
  })
);
