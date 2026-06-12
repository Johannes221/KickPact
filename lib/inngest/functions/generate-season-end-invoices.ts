import { inngest } from "@/lib/inngest/client";
import {
  listSeasonEndChargesForWindow,
  listChargesOfDraftInvoices,
  groupChargesBySponsorClub
} from "@/lib/db/queries/charges";
import { runInvoiceGroups } from "./invoice-run-core";

/**
 * Saisonende-Rechnungslauf (Paket A.4, Spec 2026-05-26 §1.2).
 *
 * Cron: 1.7. 05:00 UTC — direkt nach Saisonende (30.6.), nach dem
 * Monats-Cron (03:17), damit season_end→monthly-Wechsler zuerst von der
 * Juni-Monatsrechnung abgeholt werden.
 *
 * Selektion: alle confirmed/nicht-invoiced Charges mit snapshot='season_end'
 * UND Sponsor AKTUELL season_end, deren COALESCE(confirmedAt, createdAt) in
 * [1.7. Vorjahr, 1.7.) liegt → EINE Rechnung pro (Sponsor, Club) über den
 * geteilten Kern `runInvoiceGroups` (Nummernkreis, Withhold-Gate, PDF,
 * Draft-Recovery, Mail an Sponsor + Vereins-Admins — identisch zum
 * Monats-Lauf, nur mit Saison-Periode und Saison-Mail-Copy).
 *
 * Test-/Re-Run via Event `invoices/season-end-manual-run` mit optionalem
 * `nowIso`-Override (bestimmt, welche Saison als „gerade abgelaufen" gilt).
 *
 * Idempotenz: invoices(sponsor_id, club_id, period) UNIQUE — die
 * Saison-Periode "YYYY/YY" kollidiert nie mit Monats-Perioden "YYYY-MM".
 */

/**
 * Saison-Fenster zur Lauf-Zeit: Juli–Dezember → Saison endete am 30.6.
 * desselben Jahres; Januar–Juni → Saison endete am 30.6. des Vorjahres
 * (relevant nur für manuelle Re-Runs außerhalb des 1.7.-Crons).
 * Exportiert für Unit-Tests.
 */
export function seasonWindowFor(now: Date): {
  windowStart: Date;
  windowEnd: Date;
  /** invoices.period-Wert, z.B. "2025/26". */
  periodStr: string;
  /** Label für PDF/Mails, z.B. "Saison 2025/26". */
  periodLabel: string;
  /** Jahr des Rechnungsnummern-Kreises (= Jahr des Saisonendes). */
  invoiceYear: number;
} {
  const endYear =
    now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  const startYear = endYear - 1;
  const periodStr = `${startYear}/${String(endYear % 100).padStart(2, "0")}`;
  return {
    windowStart: new Date(Date.UTC(startYear, 6, 1)),
    windowEnd: new Date(Date.UTC(endYear, 6, 1)),
    periodStr,
    periodLabel: `Saison ${periodStr}`,
    invoiceYear: endYear
  };
}

export const generateSeasonEndInvoices = inngest.createFunction(
  {
    id: "generate-season-end-invoices",
    name: "Season-End Invoice Generation",
    concurrency: { limit: 1 }
  },
  [{ cron: "0 5 1 7 *" }, { event: "invoices/season-end-manual-run" }],
  async ({ step, logger, event }) => {
    const nowIso = (event?.data as { nowIso?: string } | undefined)?.nowIso;
    const now = nowIso ? new Date(nowIso) : new Date();
    const { windowStart, windowEnd, periodStr, periodLabel, invoiceYear } =
      seasonWindowFor(now);

    logger.info("generate-season-end-invoices start", { period: periodStr });

    const grouped = await step.run("load-season-charges", async () => {
      const rows = await listSeasonEndChargesForWindow({ windowStart, windowEnd });
      // Draft-Recovery analog zum Monats-Lauf (B6): liegengebliebene
      // 'draft'-Saisonrechnungen aus einem Fehl-Run wieder einsammeln.
      const draftRows = await listChargesOfDraftInvoices(periodStr);
      const seen = new Set(rows.map((r) => r.chargeId));
      const merged = [...rows, ...draftRows.filter((r) => !seen.has(r.chargeId))];
      return groupChargesBySponsorClub(merged);
    });

    if (grouped.length === 0) {
      logger.info("no season-end charges to invoice", { period: periodStr });
      return { period: periodStr, groups: 0, invoicesCreated: 0, mailsSent: 0 };
    }

    const { invoicesCreated, mailsSent, failures } = await runInvoiceGroups({
      grouped,
      periodStr,
      periodLabel,
      invoiceYear,
      mailKind: "season_end",
      step,
      logger
    });

    logger.info("generate-season-end-invoices done", {
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
