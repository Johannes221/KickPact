import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { teams } from "./clubs";

/**
 * Galerie-Bilder einer Mannschaft (öffentliches Profil). Logo und Cover
 * liegen als Spalten auf `teams` (logo_url / cover_url); hier nur die
 * mehrfach möglichen, sortierbaren Galerie-Bilder.
 */
export const teamImages = pgTable(
  "team_images",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    byTeamSort: index("team_images_team_sort_idx").on(t.teamId, t.sortOrder)
  })
);
