import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { teams } from "./clubs";
import { users } from "./auth";

export const invitationStatusEnum = pgEnum("invitation_status", ["pending", "used", "revoked"]);

export const sponsorInvitations = pgTable("sponsor_invitations", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  token: text("token").notNull().unique(),
  teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** Optionaler Name, der auf der Einladungsseite als Willkommensgruß angezeigt wird. */
  recipientName: text("recipient_name"),
  status: invitationStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /**
   * Token läuft 30 Tage nach Erzeugung ab. Helper `createInvitation` setzt
   * diesen Wert automatisch. `findInvitationByToken` filtert abgelaufene
   * Tokens raus, damit alte/geleakte Tokens nicht mehr verwendbar sind.
   */
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedByUserId: text("used_by_user_id").references(() => users.id, { onDelete: "set null" })
});
