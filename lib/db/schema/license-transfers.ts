/**
 * Lizenz-Transfer-Flow (Spec 2026-05-26 §1.5, Phase 5):
 *
 * Ein Vereins-Vorstand bittet den Team-Trainer (T), die Mannschaft unter die
 * Vereinslizenz aufzunehmen. T entscheidet: Annehmen (Lizenz wechselt zum
 * Periodenende, Branding sofort) / Co-Owned (Verein bekommt Trainer-Rolle,
 * Lizenz bleibt bei T) / Ablehnen.
 *
 * Pro Team max. EINE pending Anfrage (partieller Unique-Index).
 */
import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { clubs, teams } from "./clubs";
import { users } from "./auth";

export type LicenseTransferStatus = "pending" | "accepted" | "co_owned" | "rejected" | "cancelled";
export type LicenseTransferDecision = "accept_license" | "accept_co_owned" | "reject";

export const teamLicenseTransferRequests = pgTable(
  "team_license_transfer_requests",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    /** Aktueller Lizenz-Inhaber (Team-Trainer), der entscheiden muss. */
    fromUserId: text("from_user_id").notNull().references(() => users.id),
    /** Ziel-Verein, dessen Lizenz das Team übernehmen soll. */
    toClubId: text("to_club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    requestedByUserId: text("requested_by_user_id").notNull().references(() => users.id),
    status: text("status").$type<LicenseTransferStatus>().notNull().default("pending"),
    decision: text("decision").$type<LicenseTransferDecision>(),
    decisionNote: text("decision_note"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedByUserId: text("decided_by_user_id").references(() => users.id),
    /**
     * Bei Annahme: Zeitpunkt, zu dem die Lizenz technisch wechselt
     * (Periodenende von T's Stripe-Sub). Branding wechselt sofort bei
     * Annahme (decidedAt) — bewusster Trade-off, Spec §1.5 Watch-Point.
     */
    effectiveAt: timestamp("effective_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    uniquePending: uniqueIndex("team_license_transfer_unique_pending")
      .on(t.teamId)
      .where(sql`${t.status} = 'pending'`)
  })
);
