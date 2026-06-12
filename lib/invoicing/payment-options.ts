/**
 * Zahlwege-Helfer (Spec 2026-05-26 §1.9, Phase 5 Paket C).
 *
 * KickPact bleibt non-custodial: der Verein hinterlegt eigene Pay-Links
 * (PayPal.Me-Handle, Stripe Payment Link), die auf Rechnung, Rechnungs-Mail
 * und in der Zahlungserinnerungs-Vorlage erscheinen. Alles hier ist PURE
 * (kein DB-/Netzwerk-Zugriff) — bewusst, damit PDF-Builder, Mail-Templates
 * und der Erinnerungs-Text-Generator denselben Code teilen und die
 * Validierung isoliert testbar ist.
 */

const PAYPAL_HANDLE_RE = /^[a-zA-Z0-9]{1,20}$/;
const STRIPE_LINK_PREFIX = "https://buy.stripe.com/";

export type NormalizeResult =
  | { ok: true; handle: string | null }
  | { ok: false; message: string };

/**
 * Normalisiert beliebige PayPal.Me-Eingaben auf den nackten Handle:
 * „paypal.me/foo", „@foo", „https://www.paypal.me/foo/" → „foo".
 * Leere Eingabe ist gültig (= Feld löschen) und liefert `handle: null`.
 */
export function normalizePaypalHandle(input: string): NormalizeResult {
  let v = input.trim();
  if (!v) return { ok: true, handle: null };

  v = v.replace(/^https?:\/\//i, "");
  v = v.replace(/^www\./i, "");
  v = v.replace(/^paypal\.me\//i, "");
  v = v.replace(/^@/, "");
  v = v.replace(/\/+$/, "");

  if (!PAYPAL_HANDLE_RE.test(v)) {
    return {
      ok: false,
      message:
        `PayPal.Me-Name ungültig — erlaubt sind 1–20 Buchstaben/Ziffern (z. B. „fcmusterstadt" oder „paypal.me/fcmusterstadt").`
    };
  }
  return { ok: true, handle: v };
}

export type StripeLinkResult =
  | { ok: true; url: string | null }
  | { ok: false; message: string };

/**
 * Validiert einen Stripe Payment Link. Muss mit https://buy.stripe.com/
 * beginnen (verhindert Phishing-Links auf der Rechnung).
 *
 * Review M6 (2026-06-12): Der Pfad ist auf eine strikte Zeichenklasse
 * begrenzt — der Wert wird unescaped in `href="…"` der Rechnungs-Mail
 * interpoliert; mit `"` `<` `>` im Pfad konnte ein Club-Admin aus dem
 * Attribut ausbrechen und beliebiges HTML in die offizielle Mail an den
 * Sponsor injizieren.
 *
 * Leere Eingabe ist gültig (= Feld löschen) und liefert `url: null`.
 */
const STRIPE_LINK_RE = /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9/_-]+$/;

export function validateStripePaymentLink(input: string): StripeLinkResult {
  const v = input.trim();
  if (!v) return { ok: true, url: null };
  if (
    !v.startsWith(STRIPE_LINK_PREFIX) ||
    v.length <= STRIPE_LINK_PREFIX.length ||
    !STRIPE_LINK_RE.test(v)
  ) {
    return {
      ok: false,
      message: `Stripe-Link ungültig — er muss mit ${STRIPE_LINK_PREFIX} beginnen und darf nur Buchstaben/Ziffern enthalten.`
    };
  }
  return { ok: true, url: v };
}

/** Volle PayPal.Me-URL aus einem (bereits normalisierten) Handle. */
export function paypalMeUrl(handle: string): string {
  return `https://paypal.me/${handle}`;
}

export interface PaymentOptionsInput {
  iban: string | null;
  paypalHandle: string | null;
  stripePaymentLink: string | null;
  /** Verwendungszweck (Rechnungsnummer) für die Überweisungs-Zeile. */
  reference?: string | null;
}

/**
 * Baut die Zahlwege als Textzeilen (für Mail-Plaintext und die
 * Zahlungserinnerungs-Vorlage). Reihenfolge: Überweisung (Default,
 * prominent) → PayPal → Stripe. Fehlende Zahlwege werden weggelassen.
 */
export function buildPaymentOptionLines(opts: PaymentOptionsInput): string[] {
  const lines: string[] = [];
  if (opts.iban) {
    const ref = opts.reference ? ` (Verwendungszweck: ${opts.reference})` : "";
    lines.push(`Überweisung: ${opts.iban}${ref}`);
  }
  if (opts.paypalHandle) {
    lines.push(`PayPal: ${paypalMeUrl(opts.paypalHandle)}`);
  }
  if (opts.stripePaymentLink) {
    lines.push(`Online zahlen: ${opts.stripePaymentLink}`);
  }
  return lines;
}
