import QRCode from "qrcode";

/**
 * EPC069-12 / Girocode payload generator for SEPA credit transfers.
 *
 * Spec (EPC069-12 v3.0, Nov 2023): https://www.europeanpaymentscouncil.eu
 *
 * Line layout (single \n, no trailing newline):
 *   1.  Service Tag                 → "BCD"
 *   2.  Version                     → "002"   (UTF-8 encoded payload)
 *   3.  Character set               → "1"     (UTF-8)
 *   4.  Identification              → "SCT"   (SEPA Credit Transfer)
 *   5.  BIC of beneficiary bank     → optional in v002 (we leave empty —
 *                                     most German banking apps resolve
 *                                     BIC from IBAN themselves; keeps
 *                                     payload small and avoids a lookup
 *                                     table since `clubs` has no BIC col)
 *   6.  Name of beneficiary         → max 70 chars, mandatory
 *   7.  IBAN                        → mandatory, no spaces
 *   8.  Amount                      → "EUR" + decimal, e.g. "EUR12.34"
 *   9.  Purpose code                → optional, we omit
 *  10.  Structured remittance       → max 35 chars OR
 *  11.  Unstructured remittance     → max 140 chars (we use this one)
 *
 * Banking apps (Sparkasse, ING, DKB, Comdirect, N26 …) scan the QR and
 * pre-fill the SEPA form. The user only has to confirm + TAN.
 */
export interface GirocodeInput {
  beneficiaryName: string;
  iban: string;
  amountCents: number;
  remittance: string;
  /** Optional BIC — omitted by default (see header docstring). */
  bic?: string;
}

export function buildGirocodePayload(input: GirocodeInput): string {
  const name = input.beneficiaryName.trim().slice(0, 70);
  const iban = input.iban.replace(/\s+/g, "").toUpperCase();
  const amount = `EUR${(input.amountCents / 100).toFixed(2)}`;
  // Unstructured remittance, EPC limit = 140 chars.
  const remittance = input.remittance.slice(0, 140);

  // Lines 1-11 exactly per spec. Lines 9 + 10 are intentionally empty
  // (no purpose code, no structured reference) — line 11 carries the
  // unstructured remittance.
  const lines = [
    "BCD",
    "002",
    "1",
    "SCT",
    input.bic ?? "",
    name,
    iban,
    amount,
    "",
    "",
    remittance
  ];

  return lines.join("\n");
}

/**
 * Renders the Girocode payload as a base64-encoded PNG data-URL,
 * suitable to pass directly into `<Image src={...} />` from
 * `@react-pdf/renderer`.
 *
 * Returns `null` when the IBAN is missing — caller decides whether to
 * render the QR block at all.
 *
 * Error-correction "M" is the EPC-recommended minimum; "Q" gives extra
 * tolerance against print smudges + scans from photos.
 */
export async function renderGirocodeDataUrl(
  input: GirocodeInput | { iban: string | null } & Omit<GirocodeInput, "iban">
): Promise<string | null> {
  if (!input.iban) return null;
  const payload = buildGirocodePayload(input as GirocodeInput);
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 240,
    type: "image/png"
  });
}
