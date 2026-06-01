import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { teams } from "./clubs";

/**
 * Öffentliche Sponsoring-Anfragen („Leads") von der Public-Profilseite
 * `/m/{slug}`. Anders als `sponsor_inquiries` stammen diese von **nicht
 * eingeloggten** Besuchern — daher Kontaktdaten (name/email) statt einer
 * `sponsorUserId`-FK.
 *
 * Workflow:
 * - Besucher öffnet `/m/{publicSlug}` und klickt „Sponsoring anfragen"
 * - Eintrag entsteht mit Name + E-Mail + optionaler Nachricht
 * - Club-Admins bekommen eine Mail; der Lead bleibt zur Nachverfolgung in der DB
 */
export const sponsorLeads = pgTable(
  "sponsor_leads",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email").notNull(),
    message: text("message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Gesetzt, sobald ein Admin den Lead bearbeitet/abgehakt hat. */
    handledAt: timestamp("handled_at", { withTimezone: true })
  },
  (t) => ({
    teamIdx: index("sponsor_leads_team_idx").on(t.teamId, t.createdAt)
  })
);
