import {
  listChargesPendingCorrection,
  type PendingCorrectionRow
} from "@/lib/db/queries/charges";
import { triggerLabel } from "@/lib/triggers/labels";
import { CorrectionsTable, type CorrectionGroup } from "./_components/corrections-table";

export const metadata = { title: "Korrekturen · Admin · KickPact" };
export const dynamic = "force-dynamic";

function extractInvoiceNumber(pdfUrl: string | null): string | null {
  if (!pdfUrl) return null;
  const m = pdfUrl.match(/([^/]+)\.pdf$/);
  return m ? m[1] : null;
}

function matchLabel(r: PendingCorrectionRow): string {
  if (!r.matchId) return "Saison-Charge";
  const heim = r.heimName ?? "Heim";
  const gast = r.gastName ?? "Gast";
  return `${heim} ${r.ergebnisHeim ?? "—"}:${r.ergebnisGast ?? "—"} ${gast}`;
}

function groupByInvoice(rows: PendingCorrectionRow[]): CorrectionGroup[] {
  const map = new Map<string, CorrectionGroup>();
  for (const r of rows) {
    let g = map.get(r.invoiceId);
    if (!g) {
      g = {
        invoiceId: r.invoiceId,
        invoiceNumber: extractInvoiceNumber(r.invoicePdfUrl),
        invoicePeriod: r.invoicePeriod,
        invoiceStatus: r.invoiceStatus,
        // Teil-Gutschrift nur für tatsächlich zugestellte/bezahlte Belege
        // (createCorrectionInvoice-Gate). draft/withheld → nur Verwerfen.
        canCredit: r.invoiceStatus === "sent" || r.invoiceStatus === "paid",
        sponsorName: r.sponsorName,
        sponsorEmail: r.sponsorEmail,
        clubName: r.clubName,
        items: []
      };
      map.set(r.invoiceId, g);
    }
    g.items.push({
      chargeId: r.chargeId,
      amountCents: r.amountCents,
      triggerText: triggerLabel(r.triggerType),
      matchLabel: matchLabel(r),
      matchDate: r.matchDate ? new Date(r.matchDate) : null,
      flaggedAt: r.correctionFlaggedAt ? new Date(r.correctionFlaggedAt) : null
    });
  }
  return [...map.values()];
}

export default async function KorrekturenPage() {
  const rows = await listChargesPendingCorrection();
  const groups = groupByInvoice(rows);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-5 text-sm text-brand-night-navy/70">
        <p className="font-semibold text-brand-night-navy">Korrekturen offener Rechnungen</p>
        <p className="mt-1">
          Ein bereits fakturiertes Spiel wurde auf fussball.de nachträglich
          korrigiert (Einspruch/Wertung/Annullierung). Prüfe pro Charge, ob es
          eine echte Wertungsänderung war → <strong>Gutschrift</strong> (erzeugt
          einen Korrekturbeleg über den erstatteten Betrag), oder nur ein
          kurzzeitiger Scrape-Fehler → <strong>Verwerfen</strong>.
        </p>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-8 text-center text-sm text-brand-night-navy/60">
          Keine offenen Korrekturen.
        </div>
      ) : (
        <CorrectionsTable groups={groups} />
      )}
    </div>
  );
}
