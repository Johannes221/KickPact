import { pgTable, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { users } from "./auth";
import { clubs } from "./clubs";

/**
 * Operator-Admin-Panel (Spec 2026-05-29) — Phase C: Support-Inbox.
 *
 * Eingehende Hilfe-/Kontaktanfragen aus dem öffentlichen Formular
 * (/hilfe/kontakt). Der Operator bearbeitet sie im Backoffice unter
 * /admin/support: Status setzen + direkt aus dem Panel als Resend-Mail
 * antworten (R3). Antworten werden als Verlauf an `support_ticket_replies`
 * gehängt.
 */
export const supportCategoryEnum = pgEnum("support_ticket_category", [
  "frage",
  "bug",
  "abrechnung",
  "sonstiges"
]);

export const supportStatusEnum = pgEnum("support_ticket_status", [
  "open",
  "in_progress",
  "waiting",
  "closed"
]);

export const supportTickets = pgTable(
  "support_tickets",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    name: text("name").notNull(),
    email: text("email").notNull(),
    category: supportCategoryEnum("category").notNull().default("frage"),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    status: supportStatusEnum("status").notNull().default("open"),
    // Optionaler Bezug: gesetzt, wenn der Absender eingeloggt war / einem
    // Verein zugeordnet werden kann. set null, damit Ticket-Historie auch nach
    // Account-/Verein-Löschung erhalten bleibt.
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    clubId: text("club_id").references(() => clubs.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    statusIdx: index("support_tickets_status_idx").on(t.status, t.createdAt),
    createdIdx: index("support_tickets_created_idx").on(t.createdAt)
  })
);

export const supportTicketReplies = pgTable(
  "support_ticket_replies",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    operatorUserId: text("operator_user_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    // Resend-Message-ID der versendeten Antwort-Mail (für Nachverfolgung).
    mailId: text("mail_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    ticketIdx: index("support_ticket_replies_ticket_idx").on(t.ticketId, t.createdAt)
  })
);
