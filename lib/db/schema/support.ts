import { pgTable, text, timestamp, pgEnum, index, boolean, jsonb } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { users } from "./auth";
import { clubs, teams } from "./clubs";

/**
 * Operator-Admin-Panel (Spec 2026-05-29) — Phase C: Support-Inbox.
 *
 * Eingehende Hilfe-/Kontaktanfragen aus dem öffentlichen Formular
 * (/hilfe/kontakt) UND kontextbezogene In-App-Problem-Meldungen (Spiel,
 * Rechnung, …). Der Operator bearbeitet sie im Backoffice unter
 * /admin/support mit vollem Workflow (Priorität, Zuweisung, interne Notizen,
 * Status) und antwortet direkt aus dem Panel als Resend-Mail (R3). Antworten
 * + interne Notizen + Kunden-Antworten werden als Verlauf an
 * `support_ticket_replies` gehängt; eingeloggte Kunden sehen ihre Tickets im
 * Ticket-Center unter /konto/support und können dort in-App antworten.
 */
export const supportCategoryEnum = pgEnum("support_ticket_category", [
  "frage",
  "bug",
  "abrechnung",
  "spieldaten",
  "sonstiges"
]);

export const supportStatusEnum = pgEnum("support_ticket_status", [
  "open",
  "in_progress",
  "waiting",
  "closed"
]);

/** Dringlichkeit für den Admin-Workflow (Queue-Sortierung + SLA). */
export const supportPriorityEnum = pgEnum("support_ticket_priority", [
  "low",
  "normal",
  "high",
  "urgent"
]);

/**
 * Worauf sich eine Meldung bezieht. `match`/`invoice`/… verlinken das
 * betroffene Objekt (context_id) + Snapshot (context_meta); `page` hält nur
 * die URL fest; `none` ist eine kontextfreie allgemeine Anfrage.
 */
export const supportContextTypeEnum = pgEnum("support_context_type", [
  "none",
  "match",
  "invoice",
  "pledge",
  "team",
  "page"
]);

/** Wer eine Reply/Notiz verfasst hat (steuert Anzeige + „wer wartet"). */
export const supportReplyAuthorEnum = pgEnum("support_reply_author", [
  "operator",
  "customer",
  "system"
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
    priority: supportPriorityEnum("priority").notNull().default("normal"),
    // Optionaler Bezug: gesetzt, wenn der Absender eingeloggt war / einem
    // Verein zugeordnet werden kann. set null, damit Ticket-Historie auch nach
    // Account-/Verein-Löschung erhalten bleibt.
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    clubId: text("club_id").references(() => clubs.id, { onDelete: "set null" }),
    teamId: text("team_id").references(() => teams.id, { onDelete: "set null" }),
    // Operator, der das Ticket bearbeitet (Queue-Zuweisung).
    assignedToUserId: text("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null"
    }),
    // Kontext der Meldung (z.B. ein konkretes Spiel).
    contextType: supportContextTypeEnum("context_type").notNull().default("none"),
    contextId: text("context_id"),
    contextUrl: text("context_url"),
    contextMeta: jsonb("context_meta"),
    // Wann/von wem zuletzt geantwortet wurde → steuert Overdue-Erkennung.
    lastReplyAt: timestamp("last_reply_at", { withTimezone: true }),
    lastReplyBy: supportReplyAuthorEnum("last_reply_by"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    statusIdx: index("support_tickets_status_idx").on(t.status, t.createdAt),
    createdIdx: index("support_tickets_created_idx").on(t.createdAt),
    assigneeIdx: index("support_tickets_assignee_idx").on(t.assignedToUserId, t.status),
    priorityIdx: index("support_tickets_priority_idx").on(t.priority, t.status),
    userIdx: index("support_tickets_user_idx").on(t.userId, t.createdAt)
  })
);

export const supportTicketReplies = pgTable(
  "support_ticket_replies",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    // Bei Operator-Replies/-Notizen gesetzt; bei Kunden-Replies null.
    operatorUserId: text("operator_user_id").references(() => users.id, { onDelete: "set null" }),
    authorType: supportReplyAuthorEnum("author_type").notNull().default("operator"),
    // Interne Notiz (nur Backoffice) — wird nicht gemailt und dem Kunden nicht
    // angezeigt. Vereinheitlicht „interne Notizen" mit dem Reply-Verlauf.
    internal: boolean("internal").notNull().default(false),
    body: text("body").notNull(),
    // Resend-Message-ID der versendeten Antwort-Mail (für Nachverfolgung).
    mailId: text("mail_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    ticketIdx: index("support_ticket_replies_ticket_idx").on(t.ticketId, t.createdAt)
  })
);
