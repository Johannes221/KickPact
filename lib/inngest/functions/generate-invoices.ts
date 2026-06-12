import { inngest } from "@/lib/inngest/client";
import {
  lastBillingPeriod,
  billingPeriodFromString
} from "@/lib/invoicing/period";
import {
  listConfirmedChargesByPeriod,
  listChargesOfDraftInvoices,
  groupChargesBySponsorClub
} from "@/lib/db/queries/charges";
import { runInvoiceGroups } from "./invoice-run-core";

/**
 * Generates monthly invoices for all confirmed charges of the previous month.
 *
 * Cron: 1. eines Monats, 03:17 UTC (vermeidet Mitternachts-Spike, gibt Crawler-
 * Job Zeit für Sonntagsspiele zu laufen).
 *
 * Auch via Event `invoices/manual-run` triggerbar mit optionalem `period: "2026-04"`
 * Payload für manuelle Re-Runs.
 *
 * Idempotenz: invoices(sponsor_id, club_id, period) hat UNIQUE-Index — bei retries
 * wird onConflictDoNothing ausgelöst und der Mail-Send-Step übersprungen.
 *
 * Paket A.4: Die eigentliche Gruppen-Verarbeitung (Nummernkreis, PDF,
 * Withhold-Gate, Draft-Recovery, Mails) lebt im geteilten Kern
 * `runInvoiceGroups` (invoice-run-core.ts) — identisches Verhalten, der
 * Saisonende-Lauf nutzt denselben Kern mit Saison-Periode.
 */
export const generateInvoices = inngest.createFunction(
  { id: "generate-invoices", name: "Monthly Invoice Generation", concurrency: { limit: 1 } },
  [{ cron: "17 3 1 * *" }, { event: "invoices/manual-run" }],
  async ({ step, logger, event }) => {
    const overridePeriod = (event?.data as { period?: string } | undefined)?.period;
    // B8 (Audit 2026-06-11): zentrale halb-offene Periode aus
    // lib/invoicing/period.ts — vorher hatte die lokale Kopie hier ein
    // inklusives 23:59:59-Ende (1s-Loch).
    const period = overridePeriod
      ? billingPeriodFromString(overridePeriod)
      : lastBillingPeriod();
    const periodStr = `${period.year}-${String(period.month).padStart(2, "0")}`;

    logger.info("generate-invoices start", { period: periodStr });

    const grouped = await step.run("load-charges", async () => {
      const rows = await listConfirmedChargesByPeriod({
        periodStart: period.startsAt,
        periodEnd: period.endsAt
      });
      // B6: liegengebliebene 'draft'-Rechnungen (Mail-Fehler in einem
      // früheren Lauf) wieder einsammeln — deren Charges sind schon
      // 'invoiced' und fehlen daher oben. Disjunkt per Status, Dedupe
      // defensiv über chargeId.
      const draftRows = await listChargesOfDraftInvoices(periodStr);
      const seen = new Set(rows.map((r) => r.chargeId));
      const merged = [...rows, ...draftRows.filter((r) => !seen.has(r.chargeId))];
      return groupChargesBySponsorClub(merged);
    });

    if (grouped.length === 0) {
      logger.info("no charges to invoice for period", { period: periodStr });
      return { period: periodStr, groups: 0, invoicesCreated: 0, mailsSent: 0 };
    }

    const { invoicesCreated, mailsSent, failures } = await runInvoiceGroups({
      grouped,
      periodStr,
      periodLabel: period.label,
      invoiceYear: period.year,
      mailKind: "monthly",
      step,
      logger
    });

    logger.info("generate-invoices done", {
      period: periodStr,
      groups: grouped.length,
      invoicesCreated,
      mailsSent,
      failures: failures.length
    });

    return {
      period: periodStr,
      groups: grouped.length,
      invoicesCreated,
      mailsSent,
      failures
    };
  }
);
