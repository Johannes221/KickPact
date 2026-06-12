import {
  buildPaymentOptionLines,
  type PaymentOptionsInput
} from "@/lib/invoicing/payment-options";

/**
 * Zahlungserinnerungs-VORLAGE (Phase 5 Paket C, User-Entscheid: KEINE
 * Auto-Mahnungen). KickPact versendet nichts — der Verein bekommt auf der
 * Abrechnungs-Seite einen fertigen, freundlichen Text zum Kopieren bzw. als
 * mailto:-Link und verschickt selbst.
 *
 * Ton angelehnt an lib/mail/templates/invoice-reminder.tsx („eine kurze
 * Erinnerung …"), aber aus Vereins-Perspektive formuliert. PURE Funktion —
 * keine DB, kein I/O.
 */
export interface ReminderTextInput {
  sponsorName: string;
  invoiceNumber: string;
  /** Formatierter Betrag inkl. €-Zeichen, z. B. "15,00 €". */
  amountEur: string;
  /** Tage seit Rechnungsversand; <= 0 → neutrale Formulierung ohne Tage. */
  dueSinceDays: number;
  clubName: string;
  paymentOptions: PaymentOptionsInput;
}

export function buildReminderText(input: ReminderTextInput): {
  subject: string;
  body: string;
} {
  const subject = `Kurze Erinnerung: Rechnung ${input.invoiceNumber} (${input.clubName})`;

  const openSince =
    input.dueSinceDays > 0
      ? `ist seit ${input.dueSinceDays} Tagen offen`
      : "ist noch offen";

  const payLines = buildPaymentOptionLines({
    ...input.paymentOptions,
    reference: input.paymentOptions.reference ?? input.invoiceNumber
  });
  const payBlock =
    payLines.length > 0 ? `\nSo kannst du zahlen:\n${payLines.join("\n")}\n` : "";

  const body = `Hi ${input.sponsorName},

eine kurze Erinnerung von uns: deine Rechnung ${input.invoiceNumber} über ${input.amountEur} ${openSince}. Bestimmt ist sie nur untergegangen — kein Stress.
${payBlock}
Danke, dass du uns unterstützt — das bedeutet der Mannschaft viel!

Sportliche Grüße
${input.clubName}`;

  return { subject, body };
}

/**
 * Rechnungsnummer aus der pdfUrl ableiten. Die Nummer (KP-<Jahr>-<lfd>)
 * steht nicht als eigene Spalte in `invoices` — sie steckt im Storage-Key
 * (`<clubId>/KP-2026-0042.pdf`, lokal mit `_` statt `/`). Fallback: null
 * (Caller nutzt dann z. B. die Periode).
 */
export function invoiceNumberFromPdfUrl(pdfUrl: string | null): string | null {
  if (!pdfUrl) return null;
  const m = pdfUrl.match(/KP-\d{4}-\d+/);
  return m ? m[0] : null;
}
