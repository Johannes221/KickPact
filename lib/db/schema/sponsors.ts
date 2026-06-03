import {
  pgTable, text, timestamp, jsonb, pgEnum, index
} from "drizzle-orm/pg-core";
// pledgeProxiesJson (pledge_proxies_json) wurde mit Migration 0027 entfernt.
// Spec §Familie-Proxy ist deprecated — Code unter lib/validations/sponsor.ts ist Reference.
import { createId } from "@paralleldrive/cuid2";
import { users } from "./auth";

export const sponsorTypeEnum = pgEnum("sponsor_type", ["familie", "business"]);

export const sponsors = pgTable(
  "sponsors",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    type: sponsorTypeEnum("type").notNull(),
    // Privat-Sponsoren (type=familie): Beziehung zur Mannschaft. `role` ist eine
    // grobe Kategorie (freund | bekannter | verwandt | fan | sonstiges), die
    // freie `description` der Kontext ("Papa von Tim", "Onkel von …"). Beide
    // nullable — Business-Sponsoren nutzen sie i.d.R. nicht.
    role: text("role"),
    description: text("description"),
    businessName: text("business_name"),
    businessAddressJson: jsonb("business_address_json").$type<{
      street: string;
      zip: string;
      city: string;
      country: string;
    } | null>(),
    businessTaxId: text("business_tax_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    userIdx: index("sponsors_user_idx").on(t.userId)
  })
);
