import {
  pgTable, text, timestamp, boolean, jsonb,
  uniqueIndex, index, primaryKey, pgEnum
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { users } from "./auth";

export const memberRoleEnum = pgEnum("member_role", ["admin", "trainer", "viewer"]);

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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    slugIdx: uniqueIndex("clubs_slug_idx").on(t.slug)
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
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    teamFussballdeIdx: uniqueIndex("players_team_fussballde_idx")
      .on(t.teamId, t.fussballdePlayerId)
      .where(sql`${t.fussballdePlayerId} IS NOT NULL`)
  })
);
