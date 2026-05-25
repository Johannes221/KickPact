import {
  pgTable, text, timestamp, boolean, jsonb, integer,
  uniqueIndex, index, primaryKey, pgEnum
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { users } from "./auth";

export const memberRoleEnum = pgEnum("member_role", ["admin", "trainer", "viewer"]);
export const teamMemberRoleEnum = pgEnum("team_member_role", ["trainer", "viewer"]);
export const clubMembershipRequestStatusEnum = pgEnum(
  "club_membership_request_status",
  ["pending", "approved", "rejected"]
);

export const clubVerificationStatusEnum = pgEnum(
  "club_verification_status",
  ["pending", "approved", "rejected", "revoked"]
);

export const clubVerificationDocTypeEnum = pgEnum(
  "club_verification_doc_type",
  [
    "vereinsregister_auszug",
    "vorstands_beschluss",
    "vereinssatzung",
    "mitgliederversammlung_protokoll",
    "sonstiges"
  ]
);

/**
 * Onboarding-Status pro Club. Tracked als state machine: draft → stammdaten_complete → completed.
 * Bestehende Clubs bekommen per Migration-Default "completed" (Backwards-Compat).
 * Wird vom Onboarding-Resume-Dispatcher (`/onboarding/page.tsx`) gelesen, um Halbfertige
 * User zurück zur richtigen Step zu schicken statt sie im "Wie willst du starten?"-Chooser
 * zu fangen.
 */
export const onboardingStatusEnum = pgEnum("onboarding_status", [
  "draft",
  "stammdaten_complete",
  "completed"
]);

/**
 * Onboarding-Rolle: bestimmt welcher Wizard durchlaufen wurde (Mannschaft = single team /
 * Pro-Trial, Verein = multi team / Vereinslizenz-Trial). Bestimmt auch wohin der Resume-
 * Dispatcher schickt.
 */
export const onboardingRoleEnum = pgEnum("onboarding_role", ["mannschaft", "verein"]);

export const clubs = pgTable(
  "clubs",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    ort: text("ort"),
    fussballdeVereinId: text("fussballde_verein_id").unique(),
    taxId: text("tax_id"),
    isSmallBusiness: boolean("is_small_business").notNull().default(false),
    addressJson: jsonb("address_json").$type<{
      street: string;
      zip: string;
      city: string;
      country: string;
    } | null>(),
    iban: text("iban"),
    logoUrl: text("logo_url"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    // Onboarding-State (siehe Enums oben). Default "completed", damit bestehende
    // Clubs und ältere Code-Pfade out-of-the-box korrekt sind.
    onboardingStatus: onboardingStatusEnum("onboarding_status")
      .notNull()
      .default("completed"),
    onboardingRole: onboardingRoleEnum("onboarding_role")
      .notNull()
      .default("verein"),
    onboardingStartedAt: timestamp("onboarding_started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    slugIdx: uniqueIndex("clubs_slug_idx").on(t.slug),
    // Resume-Dispatcher-Query: "alle Draft-Clubs dieses Users". Partial index, weil
    // im Steady-State 99.x% aller Clubs completed sind.
    draftIdx: index("clubs_draft_idx")
      .on(t.onboardingStatus)
      .where(sql`${t.onboardingStatus} != 'completed'`)
  })
);

export const clubMemberships = pgTable(
  "club_memberships",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    clubId: text("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("viewer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.clubId] })
  })
);

export const teams = pgTable(
  "teams",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    clubId: text("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    saison: text("saison").notNull(),
    fussballdeTeamId: text("fussballde_team_id"),
    fussballdeSlug: text("fussballde_slug"),
    isActive: boolean("is_active").notNull().default(true),
    /**
     * Sponsor-Discover (Spec §6.10): wenn true, erscheint die Mannschaft in
     * der öffentlichen Sponsor-Suche. Mannschafts-Admins können das im
     * Dashboard ein-/ausschalten.
     */
    discoverable: boolean("discoverable").notNull().default(false),
    /**
     * Kurze Beschreibung für das öffentliche Discover-Profil (max ~280 chars).
     */
    publicTagline: text("public_tagline"),
    /**
     * Team-Logo. Optional, von Club-Admin in Team-Einstellungen hochgeladen.
     * Storage-URL im Format `r2://<bucket>/teams/<teamId>/logo-<cuid>.<ext>`
     * oder `local://...`, aufgelöst via `getDocumentSignedUrl`.
     */
    logoUrl: text("logo_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    clubSaisonIdx: index("teams_club_saison_idx").on(t.clubId, t.saison),
    fussballdeIdx: uniqueIndex("teams_fussballde_idx")
      .on(t.fussballdeTeamId, t.saison)
      .where(sql`${t.fussballdeTeamId} IS NOT NULL`),
    discoverableIdx: index("teams_discoverable_idx").on(t.discoverable).where(sql`${t.discoverable} = true`)
  })
);

export const players = pgTable(
  "players",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    fussballdePlayerId: text("fussballde_player_id"),
    name: text("name").notNull(),
    /**
     * DSGVO-Opt-out: wenn true, ignoriert der Crawler diesen Spieler bei
     * Name-Updates (Spalte bleibt auf "Anonymisiert"). Wird vom Support
     * manuell per Datenschutz-Mail gesetzt. Spalte existiert ab Phase 1,
     * damit die DSE-Versprechen (Opt-out via Mail) sofort technisch
     * umsetzbar sind — ein simples `UPDATE players SET blocked=true,
     * name='Anonymisiert' WHERE id=…` reicht aus.
     */
    blocked: boolean("blocked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    teamFussballdeIdx: uniqueIndex("players_team_fussballde_idx")
      .on(t.teamId, t.fussballdePlayerId)
      .where(sql`${t.fussballdePlayerId} IS NOT NULL`)
  })
);

export const teamMemberships = pgTable(
  "team_memberships",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    teamId: text("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
    role: teamMemberRoleEnum("role").notNull().default("viewer"),
    invitedByUserId: text("invited_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.teamId] }),
    teamIdx: index("team_memberships_team_idx").on(t.teamId)
  })
);

export const clubMembershipRequests = pgTable(
  "club_membership_requests",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    clubId: text("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
    requestedRole: memberRoleEnum("requested_role").notNull(),
    requestedTeamId: text("requested_team_id").references(() => teams.id, { onDelete: "cascade" }),
    message: text("message"),
    status: clubMembershipRequestStatusEnum("status").notNull().default("pending"),
    responseMessage: text("response_message"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    respondedByUserId: text("responded_by_user_id").references(() => users.id, { onDelete: "set null" }),
    isConflictClaim: boolean("is_conflict_claim").notNull().default(false),
    conflictDocStorageKey: text("conflict_doc_storage_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    // Partial unique index: only one OPEN (pending) request per user/club/team
    // combination. Once resolved (approved/rejected) the user can request again.
    //
    // NOTE: This index uses NULLS NOT DISTINCT (PG 15+), so duplicate pending
    // requests with `requestedTeamId = NULL` (club-wide) are also blocked at
    // the DB level. Drizzle's uniqueIndex() builder does NOT support
    // `.nullsNotDistinct()` (only the table-level `unique()` constraint does),
    // so the clause is applied via a hand-written migration. The schema-level
    // declaration here is otherwise faithful — drizzle-kit will not regenerate
    // a diff because the column tuple, partial WHERE and uniqueness all match.
    uniquePending: uniqueIndex("club_request_unique_pending_idx")
      .on(t.userId, t.clubId, t.requestedTeamId)
      .where(sql`${t.status} = 'pending'`),
    // Admin-inbox query: list pending requests for a given club.
    clubStatusIdx: index("club_request_club_status_idx").on(t.clubId, t.status)
  })
);

export const clubVerifications = pgTable(
  "club_verifications",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    clubId: text("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
    submittedByUserId: text("submitted_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    docType: clubVerificationDocTypeEnum("doc_type").notNull(),
    docFilename: text("doc_filename").notNull(),
    docStorageKey: text("doc_storage_key").notNull(),
    docMimeType: text("doc_mime_type").notNull(),
    docSizeBytes: integer("doc_size_bytes").notNull(),
    submitterRole: text("submitter_role").notNull(),
    submitterFullName: text("submitter_full_name").notNull(),
    submitterNotes: text("submitter_notes"),
    status: clubVerificationStatusEnum("status").notNull().default("pending"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedByUserId: text("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    rejectionReason: text("rejection_reason"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    clubStatusIdx: index("club_verifications_club_status_idx").on(t.clubId, t.status),
    pendingIdx: index("club_verifications_pending_idx")
      .on(t.submittedAt)
      .where(sql`${t.status} = 'pending'`)
  })
);
