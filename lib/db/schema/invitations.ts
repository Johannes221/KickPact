import { pgTable, text, timestamp, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { teams, clubs } from "./clubs";
import { users } from "./auth";

export const invitationStatusEnum = pgEnum("invitation_status", ["pending", "used", "revoked"]);

/**
 * Einladungs-Typ. `sponsor` = klassischer Pledge-Invite, lädt einen Sponsor
 * auf eine Mannschaft ein. `team-member` = Verein-Admin lädt eine Person als
 * Trainer/Viewer in den Verein oder eine Mannschaft ein.
 */
export const invitationKindEnum = pgEnum("invitation_kind", ["sponsor", "team-member"]);

/**
 * Rolle, die ein `team-member`-Invite gewähren soll. Nullable für
 * `sponsor`-Invites. Validierung pro Scope:
 *  - Club-Invite (`clubId` gesetzt): `trainer` | `viewer` — Club-`admin` wird
 *    über Mitglieder-Promotion vergeben, nicht via Invite.
 *  - Team-Invite (`teamId` gesetzt): `admin` (Mannschaftsadmin) | `viewer`.
 */
export const invitationRoleEnum = pgEnum("invitation_role", ["admin", "trainer", "viewer"]);

export const sponsorInvitations = pgTable("sponsor_invitations", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  token: text("token").notNull().unique(),
  /**
   * `kind = sponsor` → teamId pflicht, clubId leer, role leer.
   * `kind = team-member` → entweder teamId (Team-Membership) oder clubId
   * (Club-Membership) plus role.
   */
  kind: invitationKindEnum("kind").notNull().default("sponsor"),
  teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
  clubId: text("club_id").references(() => clubs.id, { onDelete: "cascade" }),
  role: invitationRoleEnum("role"),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  /** Optionaler Name, der auf der Einladungsseite als Willkommensgruß angezeigt wird. */
  recipientName: text("recipient_name"),
  /** Optionale Empfänger-E-Mail (nur für team-member Invites informativ). */
  recipientEmail: text("recipient_email"),
  status: invitationStatusEnum("status").notNull().default("pending"),
  /**
   * Broadcast vs. 1:1. `false` (Default) = Broadcast-Sponsor-Link: mehrfach
   * einlösbar, damit der Verein EINEN Link an viele Sponsoren teilen kann
   * („am Stammtisch"); create-pledge verbraucht ihn NICHT, der Doppel-Submit-
   * Schutz hängt an pledges.idempotencyKey. `true` = 1:1-Link (Inquiry-Accept
   * via respondToInquiry): an genau einen Sponsor gemailt, bleibt single-use —
   * create-pledge konsumiert ihn atomar via markInvitationUsed, damit der Kader
   * (via /api/squad-Token) nicht durch Weiterleiten für Dritte sichtbar wird.
   * team-member-Invites sind immer single-use (eigener Accept-Pfad, ignoriert
   * dieses Feld).
   */
  singleUse: boolean("single_use").notNull().default(false),
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
