import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  boolean,
  jsonb,
  index
} from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { users } from "./auth";

/**
 * Benachrichtigungs-System (Spec 2026-06-02). NUR native iOS-Push über APNs +
 * eine In-App-Inbox. KEIN Web-Push / kein VAPID (bewusste Nutzer-Entscheidung).
 */

/**
 * Registrierte Push-Tokens. Ein APNs-Device-Token ist pro App-Install global
 * eindeutig → natürlicher Primärschlüssel. Wechselt das Gerät den eingeloggten
 * User, übernimmt ein `ON CONFLICT (token) DO UPDATE` den neuen `user_id`.
 */
export const deviceTokens = pgTable(
  "device_tokens",
  {
    token: text("token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Vorbereitet für späteres Android; v1 immer 'ios'.
    platform: text("platform").notNull().default("ios"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    userIdx: index("device_tokens_user_idx").on(t.userId)
  })
);

export const notificationTypeEnum = pgEnum("notification_type", [
  "match_result",
  "access_request",
  "sponsor_inquiry",
  "sponsor_lead",
  "invoice_created",
  "trial_ending"
]);

export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];

/**
 * In-App-Inbox. Wird IMMER geschrieben (vollständige Historie) — unabhängig
 * davon, ob der User für diese Kategorie Push aktiviert hat. Der Push-Toggle in
 * `notification_settings` steuert nur das native Alert, nicht diesen Eintrag.
 */
export const notifications = pgTable(
  "notifications",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: notificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** Deep-Link-Pfad (relativ), z.B. "/verein/<slug>/sponsoren". */
    link: text("link"),
    /** Zusatz-Payload für die App (z.B. { matchId }). */
    dataJson: jsonb("data_json").$type<Record<string, unknown>>(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    userCreatedIdx: index("notifications_user_created_idx").on(t.userId, t.createdAt)
  })
);

/**
 * Pro-User-Präferenzen, welche Kategorien gepusht werden. Eigene Tabelle statt
 * Spalten auf `users`, um better-auth-Schema-Drift zu vermeiden.
 *
 * Opt-out-Modell: fehlt die Zeile, gelten ALLE Kategorien als aktiviert.
 */
export const notificationSettings = pgTable("notification_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  matchResults: boolean("match_results").notNull().default(true),
  accessRequests: boolean("access_requests").notNull().default(true),
  sponsorRequests: boolean("sponsor_requests").notNull().default(true),
  billing: boolean("billing").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export type NotificationSettingsRow = typeof notificationSettings.$inferSelect;
