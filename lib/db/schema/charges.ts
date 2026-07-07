import {
  pgTable, text, timestamp, integer, pgEnum, index, primaryKey, uniqueIndex
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { pledges, pledgeRules, triggerTypeEnum } from "./pledges";
import { matches, matchEvents } from "./matches";
import { sponsors } from "./sponsors";
import { clubs } from "./clubs";

export const chargeStatusEnum = pgEnum("charge_status", [
  "pending_approval",
  "confirmed",
  "invoiced",
  "cancelled"
]);

export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "sent", "paid", "withheld"]);

export const charges = pgTable(
  "charges",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    pledgeId: text("pledge_id").notNull().references(() => pledges.id, { onDelete: "cascade" }),
    pledgeRuleId: text("pledge_rule_id")
      .notNull()
      .references(() => pledgeRules.id, { onDelete: "cascade" }),
    /**
     * matchId ist NULL für Saison-Wetten-Charges (die fallen erst am Saison-Ende an,
     * nicht pro Spiel). Per-Spiel-Charges haben hier weiterhin eine matchId.
     */
    matchId: text("match_id").references(() => matches.id, { onDelete: "cascade" }),
    matchEventId: text("match_event_id").references(() => matchEvents.id, { onDelete: "set null" }),
    /**
     * Für Saison-Charges: welche Saison gemeint ist. Format wie teams.saison
     * ("2025/26"). Garantiert Idempotenz bei evaluate-season-Re-Runs.
     */
    saison: text("saison"),
    /**
     * Diskriminator für event-lose Tor-Charges (results_only-Mannschaften:
     * fussball.de liefert nur den Endstand, keine Tor-Events). 1-basierte
     * Tor-Nummer; 0 = kein Diskriminator nötig (Outcome-Charges wie win/draw
     * sowie alle event-gebundenen Charges). Ohne diese Spalte ließ
     * charges_unique_match_trigger_idx nur EINE Tor-Charge pro Spiel zu —
     * bei 3:1 entstand 1× statt 3× der Tor-Betrag (Audit 2026-06-09 Bug 1).
     */
    goalIndex: integer("goal_index").notNull().default(0),
    triggerType: triggerTypeEnum("trigger_type").notNull(),
    amountCents: integer("amount_cents").notNull(),
    /**
     * Spec 2026-05-26 §1.2: Snapshot des Sponsor-Billing-Cycles zum
     * SPIELZEITPUNKT (Lookup via sponsor_billing_cycle_history). monthly-
     * Charges landen auf der Monatsrechnung, season_end-Charges sammeln sich
     * bis zur Saisonende-Rechnung (30.06.). Snapshot statt Live-Lookup, damit
     * spätere Cycle-Wechsel vergangene Beiträge nicht umsortieren.
     */
    billingCycleSnapshot: text("billing_cycle_snapshot").notNull().default("monthly"),
    status: chargeStatusEnum("status").notNull().default("confirmed"),
    /**
     * Reason this charge was cancelled (e.g. "match_updated"). Set by the
     * match-update-path when fussball.de data changes and we have to
     * invalidate previously-recorded charges before recomputing.
     */
    cancelledReason: text("cancelled_reason"),
    /**
     * SECURITY (H5): Audit für Charge-Stornos. `cancelledByUserId` hält den
     * Akteur fest (NULL bei System-Stornos wie match_updated), `cancelledAt`
     * den Zeitpunkt. Plain text (kein FK) analog zu `paidMarkedBy`.
     */
    cancelledByUserId: text("cancelled_by_user_id"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    /**
     * Daten-Integrität (2026-07-07): gesetzt, wenn fussball.de das Ergebnis
     * eines Spiels NACH dem Rechnungslauf korrigiert (Einspruch/Wertung/
     * Annullierung) und dabei bereits `invoiced`-Charges betrifft. Diese
     * Charges bleiben `invoiced` (der Betrag wurde fakturiert — nicht still
     * stornieren, das wäre Buchhaltung), werden aber für die Admin-Review-Queue
     * (/admin/rechnungen/korrekturen) markiert. Ein Operator entscheidet dort
     * zwischen Teil-Gutschrift (createCorrectionInvoice) und Verwerfen
     * (Scrape-Flake). Wird beim Storno der Charge oder beim Verwerfen wieder
     * auf NULL gesetzt. NULL = nichts offen.
     */
    correctionFlaggedAt: timestamp("correction_flagged_at", { withTimezone: true }),
    invoiceId: text("invoice_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true })
  },
  (t) => ({
    pledgeStatusIdx: index("charges_pledge_status_idx").on(t.pledgeId, t.status),
    // Beide Idempotenz-Indizes klammern stornierte Charges aus: der
    // Match-Update-Pfad (invalidateChargesForMatch → Re-Evaluation) setzt
    // Charges nur auf status='cancelled' — blieben sie im Index, blockierte
    // die stornierte Zeile jeden Re-Insert nach einer fussball.de-Korrektur
    // (z.B. Sieg-Charge nach 2:1→3:1 dauerhaft weg; Audit 2026-06-09 Bug 2).
    uniqueEvent: uniqueIndex("charges_unique_event_idx")
      .on(t.pledgeRuleId, t.matchEventId)
      .where(sql`${t.matchEventId} IS NOT NULL AND ${t.status} <> 'cancelled'`),
    uniqueMatchTrigger: uniqueIndex("charges_unique_match_trigger_idx")
      .on(t.pledgeRuleId, t.matchId, t.triggerType, t.goalIndex)
      .where(
        sql`${t.matchEventId} IS NULL AND ${t.matchId} IS NOT NULL AND ${t.status} <> 'cancelled'`
      ),
    // Saison-Charge: 1× pro pledge_rule + saison. Stornierte Charges sind
    // ausgenommen (Audit 2026-06-11 / B9) — analog zu den beiden Match-Indizes
    // oben: eine cancelled-Saison-Charge darf die Re-Emission nach einer
    // Korrektur (z.B. Dispute → Re-Eval) nicht dauerhaft blockieren.
    uniqueSeason: uniqueIndex("charges_unique_season_idx")
      .on(t.pledgeRuleId, t.saison)
      .where(sql`${t.saison} IS NOT NULL AND ${t.status} <> 'cancelled'`)
  })
);

export const invoices = pgTable(
  "invoices",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    sponsorId: text("sponsor_id").notNull().references(() => sponsors.id, { onDelete: "cascade" }),
    clubId: text("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
    period: text("period").notNull(),
    totalCents: integer("total_cents").notNull(),
    pdfUrl: text("pdf_url"),
    status: invoiceStatusEnum("status").notNull().default("draft"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidMarkedAt: timestamp("paid_marked_at", { withTimezone: true }),
    paidMarkedBy: text("paid_marked_by"),
    /**
     * Sponsor self-claim of payment ("Habe bezahlt"-Toggle in der
     * Sponsor-Rechnungsliste). KickPact ist non-custodial — diese Spalte
     * ist nur ein UX-Marker und ersetzt NICHT die Vereinsbestätigung
     * (`paidMarkedAt`). Status-Logik:
     *   - paidMarkedAt != NULL                              → "Bezahlt (Verein bestätigt)"
     *   - markedPaidBySponsorAt != NULL && paidMarkedAt = NULL → "Bezahlt (warte auf Verein)"
     *   - sonst                                              → "Offen"
     */
    markedPaidBySponsorAt: timestamp("marked_paid_by_sponsor_at", { withTimezone: true }),
    /**
     * Storno (Spec 2026-05-29 §J): Wenn gesetzt, wurde diese Rechnung durch eine
     * Stornorechnung aufgehoben. `reversalOfInvoiceId` zeigt von der
     * Storno-Rechnung (eigene Zeile, negativer Betrag) auf die Original-Rechnung.
     */
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    reversalOfInvoiceId: text("reversal_of_invoice_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    // Verhindert Doppel-Generierung derselben Monatsrechnung. Partiell: gilt
    // NUR für reguläre Rechnungen — Storno-Zeilen (reversal_of_invoice_id
    // gesetzt) teilen sich (sponsor, club, period) mit der Original-Rechnung
    // und sind daher ausgenommen.
    uniqueSponsorPeriod: uniqueIndex("invoices_sponsor_club_period_idx")
      .on(t.sponsorId, t.clubId, t.period)
      .where(sql`${t.reversalOfInvoiceId} IS NULL`)
  })
);

/**
 * Audit 2026-05-24 Task 2.1: Race-safe Invoice-Sequenz pro (club, year).
 *
 * `nextInvoiceNumber()` machte vorher `COUNT(*)+1` ohne Lock — zwei parallele
 * Cron+Manual-Runs konnten identische `KP-2026-0001` produzieren, danach
 * R2-PUT überschreibt → Sponsor A bekam PDF von Sponsor B. Diese Tabelle hält
 * den letzten ausgegebenen Counter pro Club+Jahr. Update über atomic
 * `INSERT ... ON CONFLICT DO UPDATE SET counter = counter + 1 RETURNING counter`.
 */
export const invoiceCounters = pgTable(
  "invoice_counters",
  {
    clubId: text("club_id").notNull().references(() => clubs.id, { onDelete: "cascade" }),
    year: integer("year").notNull(),
    counter: integer("counter").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    pk: primaryKey({ columns: [t.clubId, t.year] })
  })
);

export const invoiceItems = pgTable("invoice_items", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  invoiceId: text("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  chargeId: text("charge_id").notNull().references(() => charges.id, { onDelete: "restrict" }),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull()
});
