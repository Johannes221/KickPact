import {
  pgTable, text, timestamp, jsonb, pgEnum, index, uniqueIndex
} from "drizzle-orm/pg-core";
// pledgeProxiesJson (pledge_proxies_json) wurde mit Migration 0027 entfernt.
// Spec §Familie-Proxy ist deprecated — Code unter lib/validations/sponsor.ts ist Reference.
import { createId } from "@paralleldrive/cuid2";
import { users } from "./auth";

// Privatpersonen-only (Spec 2026-07-06): Sponsoren sind ausschließlich
// Privatpersonen. Der Wert 'business' ist INERT — Postgres kann Enum-Werte
// nicht gefahrlos droppen (gleiches Muster wie der inerte 'annual'-Cycle in
// billing.ts). Kein Code-Pfad erzeugt oder rendert mehr 'business'
// (0 Bestandsdaten, verifiziert 2026-07-06); falls je ein Alt-Wert auftaucht,
// steht normalizeSponsorType() (lib/validations/sponsor.ts) als defensiver
// Lese-Helper bereit. Die Spalten businessName/businessAddressJson/
// businessTaxId bleiben nullable stehen und werden nie mehr befüllt.
export const sponsorTypeEnum = pgEnum("sponsor_type", ["familie", "business"]);

/**
 * Abrechnungs-Rhythmus pro Sponsor (Spec 2026-05-26 §1.2):
 * - `monthly`    — Rechnung am Monats-1. (Default, heutiges Verhalten)
 * - `season_end` — alle Beiträge sammeln sich, EINE Rechnung am Saisonende (30.06.)
 */
export type SponsorBillingCycle = "monthly" | "season_end";

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
    /** Spec §1.2: monthly (Default) oder season_end. Wechsel jederzeit erlaubt. */
    billingCycle: text("billing_cycle")
      .$type<SponsorBillingCycle>()
      .notNull()
      .default("monthly"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    // UNIQUE (nicht nur index): genau EIN Sponsor-Profil pro User. Ohne diese
    // Invariante ließ ein paralleler Erst-Pact-Submit (Doppelklick auf einem
    // Broadcast-Invite) zwei Profile mit verschiedenen sponsorIds entstehen —
    // dann griff der Pledge-Idempotenz-Index (sponsor_id, idempotency_key)
    // nicht und der Sponsor wurde die ganze Saison doppelt abgerechnet.
    // createSponsorProfile löst den Konflikt jetzt via onConflictDoNothing +
    // Reselect zur stabilen sponsorId auf.
    userIdx: uniqueIndex("sponsors_user_idx").on(t.userId)
  })
);

/**
 * Historie der Cycle-Wechsel (Spec §1.2): Der Cycle eines Beitrags wird durch
 * den SPIELZEITPUNKT des Events bestimmt, nicht durch den Erzeugungs-Zeitpunkt —
 * rückwirkende Approvals gehören dem Cycle, der zum Spielzeitpunkt galt.
 * Lookup: jüngste Row mit validFrom <= matchDate.
 */
export const sponsorBillingCycleHistory = pgTable(
  "sponsor_billing_cycle_history",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    sponsorId: text("sponsor_id")
      .notNull()
      .references(() => sponsors.id, { onDelete: "cascade" }),
    cycle: text("cycle").$type<SponsorBillingCycle>().notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    lookupIdx: index("sponsor_cycle_history_lookup_idx").on(t.sponsorId, t.validFrom)
  })
);
