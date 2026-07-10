import { pgTable, text, timestamp, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { users } from "./auth";
import { teams } from "./clubs";
import { sponsorInvitations } from "./invitations";

/**
 * Sponsor-Discover Inquiries (Spec §6.10).
 *
 * Workflow:
 * - Sponsor klickt auf /sponsor/discover bei einer Mannschaft "Sponsoring anfragen"
 * - Eintrag entsteht mit status=pending + optionaler Nachricht
 * - Mannschafts-Admin sieht in seinem Dashboard die Anfrage → akzeptiert / lehnt ab
 * - Bei accept: KickPact erzeugt automatisch einen Einladungslink + mailt den
 *   Sponsor mit dem Link
 */
export const inquiryStatusEnum = pgEnum("inquiry_status", [
  "pending",
  "accepted",
  "rejected",
  "expired"
]);

export const sponsorInquiries = pgTable(
  "sponsor_inquiries",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    sponsorUserId: text("sponsor_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    status: inquiryStatusEnum("status").notNull().default("pending"),
    message: text("message"),
    responseMessage: text("response_message"),
    /**
     * Beim Annehmen (status=accepted) erzeugt `respondToInquiry` eine
     * Sponsor-Einladung und verknüpft sie hier. So weiß die Discover-Page,
     * welcher Einladungs-Token zu *dieser* angenommenen Anfrage gehört, und
     * kann den Sponsor direkt in den Pledge-Builder schicken (statt nur den
     * E-Mail-Link als einzigen Weg zu haben). Nullable: pending/rejected haben
     * keine Einladung. `set null`, falls die Einladung später hart gelöscht wird.
     */
    invitationId: text("invitation_id").references(() => sponsorInvitations.id, {
      onDelete: "set null"
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    respondedBy: text("responded_by").references(() => users.id, { onDelete: "set null" })
  },
  (t) => ({
    teamStatusIdx: index("sponsor_inquiries_team_status_idx").on(t.teamId, t.status),
    sponsorStatusIdx: index("sponsor_inquiries_sponsor_status_idx").on(t.sponsorUserId, t.status),
    // Nur EINE offene Anfrage pro (Team, Sponsor) — verhindert atomar die
    // doppelte pending-Anfrage bei Doppelklick (createSponsorInquiry nutzt
    // onConflictDoNothing). Analog club_request_unique_pending_idx.
    uniquePending: uniqueIndex("sponsor_inquiries_unique_pending_idx")
      .on(t.teamId, t.sponsorUserId)
      .where(sql`${t.status} = 'pending'`)
  })
);
