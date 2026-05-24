import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";

/**
 * Saisons-Stammdaten (DFB / regional).
 *
 * `matchdayFiveAt` ist das Cutoff-Datum für:
 *   - Saison-Pass-Buchung (`canBookSeasonPass`)
 *   - Saison-Wetten-Pledges (`canCreateSeasonWager`)
 *
 * Bewusst per Saison pflegbar (Liga-abhängig) statt automatisch
 * berechnet. Default-Seed: ~6 Wochen nach `startsAt`.
 */
export const seasons = pgTable(
  "seasons",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    /** Kompaktes Saison-Kürzel, z.B. "2627" für 2026/27. */
    code: text("code").notNull().unique(),
    /** Default DFB; Erweiterung pro Liga/Land später. */
    region: text("region").notNull().default("DFB"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    /** Cutoff für Saison-Pass + Saison-Wetten. Inclusive. */
    matchdayFiveAt: timestamp("matchday_5_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (t) => ({
    rangeIdx: index("seasons_range_idx").on(t.startsAt, t.endsAt)
  })
);
