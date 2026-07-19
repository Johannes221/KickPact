import { Document, Page, Text, View, Image, Link, StyleSheet, Font } from "@react-pdf/renderer";
import path from "node:path";
import { eur } from "@/lib/utils/currency";
import { paypalMeUrl } from "@/lib/invoicing/payment-options";

// Inter Font registrieren — lokale TTFs unter public/fonts/inter/
// (Remote rsms.me liefert seit ~Mai 2026 HTTP 404 für /font-files/*.otf —
//  daher self-hosted; verifiziert in tests/rendering/invoice-pdf.test.tsx)
Font.register({
  family: "Inter",
  fonts: [
    { src: path.join(process.cwd(), "public/fonts/inter/Inter-Regular.ttf") },
    { src: path.join(process.cwd(), "public/fonts/inter/Inter-Bold.ttf"), fontWeight: 700 }
  ]
});

const s = StyleSheet.create({
  page: {
    padding: 50,
    paddingBottom: 80,
    fontFamily: "Inter",
    fontSize: 10,
    color: "#1A1A2E"
  },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 36 },
  clubBlock: { fontSize: 9, color: "#525252", maxWidth: 240 },
  brandName: { fontSize: 18, fontWeight: 700, color: "#1A1A2E", marginBottom: 8 },
  sponsorBlock: { textAlign: "right", fontSize: 10, maxWidth: 240 },
  sponsorName: { fontWeight: 700, fontSize: 11, color: "#1A1A2E" },
  meta: { marginBottom: 24 },
  invoiceTitle: { fontSize: 18, fontWeight: 700, marginBottom: 10, color: "#1A1A2E" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 3, fontSize: 10 },
  metaLabel: { color: "#525252" },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#1A1A2E",
    paddingBottom: 5,
    fontWeight: 700,
    fontSize: 9,
    textTransform: "uppercase",
    color: "#525252",
    letterSpacing: 0.5
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 7,
    borderBottomWidth: 0.5,
    borderBottomColor: "#CDD2D1",
    fontSize: 10
  },
  cellDate: { width: 70 },
  cellMatch: { flex: 1, paddingRight: 6 },
  cellTrigger: { width: 100, color: "#525252" },
  cellAmount: { width: 70, textAlign: "right" },
  summary: { marginTop: 18, alignSelf: "flex-end", width: 240 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#1A1A2E",
    fontWeight: 700,
    fontSize: 13
  },
  totalAmount: { color: "#01C457" },
  noteText: { marginTop: 24, fontSize: 9, color: "#525252", lineHeight: 1.5, maxWidth: 360 },
  payBox: {
    marginTop: 24,
    padding: 12,
    borderWidth: 0.5,
    borderColor: "#CDD2D1",
    borderRadius: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 14
  },
  payBoxText: { flex: 1, fontSize: 10, color: "#1A1A2E", lineHeight: 1.5 },
  payBoxLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: "#1A1A2E",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.4
  },
  payBoxIban: { fontFamily: "Inter", fontSize: 10, color: "#1A1A2E" },
  payBoxMeta: { fontSize: 9, color: "#525252", marginTop: 2 },
  // Zusätzliche Zahlwege (Spec §1.9): PayPal.Me / Stripe Payment Link.
  // Bewusst unter dem IBAN-Block — Girocode bleibt Default & prominent.
  payLinkRow: { marginTop: 6, fontSize: 9, color: "#525252" },
  payLink: { color: "#1A1A2E", textDecoration: "underline" },
  qrWrap: { width: 80, alignItems: "center" },
  qrImage: { width: 80, height: 80 },
  qrCaption: {
    marginTop: 4,
    fontSize: 7,
    color: "#525252",
    textAlign: "center",
    lineHeight: 1.3
  },
  footer: {
    position: "absolute",
    bottom: 36,
    left: 50,
    right: 50,
    fontSize: 8,
    color: "#a3a3a3",
    borderTopWidth: 0.5,
    borderTopColor: "#CDD2D1",
    paddingTop: 8,
    lineHeight: 1.5
  }
});

/**
 * Privatpersonen-only (Spec 2026-07-06 §4): Das sponsor-gerichtete Dokument
 * ist KEINE Rechnung mehr, sondern eine „Zahlungsübersicht" über die zugesagten
 * Unterstützungsbeiträge. Konsequenzen:
 *   - Kein USt-Ausweis, kein Netto/Brutto, kein §19-Hinweis, keine USt-IdNr —
 *     Beiträge von Privatpersonen ohne Gegenleistung sind kein Leistungs-
 *     austausch (Werbeleistung); ein Steuerausweis wäre ein §14c-UStG-Risiko
 *     und würde das Spenden-Framing zerstören.
 *   - Business-Adressblock entfällt (Sponsoren sind ausschließlich privat).
 *   - Die interne Beleg-Nummer (invoices-Tabelle) bleibt als Referenz/
 *     Verwendungszweck erhalten — reines Anzeige-Reframing.
 */
export interface InvoiceData {
  invoiceNumber: string;
  period: string;
  issuedAt: Date;
  /**
   * Pricing v2: Tier des Teams. Steuert Footer-Branding:
   *   - basic → KickPact-Footer "Powered by KickPact · kickpact.com"
   *   - pro / verein → Vereins-Footer ohne KickPact-Branding
   * Falls undefined → Default `basic` (sichere Annahme).
   */
  plan?: "basic" | "pro" | "verein";
  club: {
    name: string;
    address: { street: string; zip: string; city: string; country?: string };
    iban: string | null;
    /**
     * Spec §1.9 (Phase 5): optionale Zusatz-Zahlwege des Vereins. Werden —
     * sofern gesetzt — unter dem IBAN/Girocode-Block als anklickbare Links
     * gerendert. Girocode bleibt der Default-Zahlweg.
     */
    paypalHandle?: string | null;
    stripePaymentLink?: string | null;
  };
  sponsor: {
    displayName: string;
    email: string;
  };
  items: {
    matchDate: Date;
    matchLabel: string;
    triggerLabel: string;
    amountCents: number;
  }[];
  /**
   * Optional pre-rendered EPC069-12 Girocode PNG as data-URL. Caller must
   * render this *before* invoking `InvoicePdf` because react-pdf's `<Image>`
   * cannot do async work synchronously inside a component. Generated via
   * `lib/invoicing/girocode.renderGirocodeDataUrl`.
   *
   * When `undefined` (or no IBAN), the QR block is not rendered.
   */
  girocodeDataUrl?: string | null;
  /**
   * Wenn gesetzt, wird das Dokument als STORNOBELEG (Korrektur) gerendert:
   * Titel "Stornobeleg", Referenz auf die Original-Belegnummer, keine
   * Zahlungsaufforderung (Beträge sind gegenläufig = Korrektur).
   */
  stornoOfNumber?: string | null;
}

export function InvoicePdf({ data }: { data: InvoiceData }) {
  // Privatspenden-Framing: Zahlbetrag = Summe der zugesagten Beiträge.
  // Kein USt-Aufschlag (siehe Interface-Kommentar).
  const total = data.items.reduce((sum, i) => sum + i.amountCents, 0);
  const issued = data.issuedAt.toLocaleDateString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const isStorno = Boolean(data.stornoOfNumber);
  const docTitle = isStorno ? "Stornobeleg" : "Zahlungsübersicht";

  return (
    <Document
      title={`${docTitle} ${data.invoiceNumber}`}
      author={data.club.name}
      subject={`KickPact-${docTitle} für ${data.period}`}
    >
      <Page size="A4" style={s.page}>
        {/* Header: Verein links, Sponsor rechts */}
        <View style={s.header}>
          <View style={s.clubBlock}>
            <Text style={s.brandName}>{data.club.name}</Text>
            <Text>{data.club.address.street}</Text>
            <Text>
              {data.club.address.zip} {data.club.address.city}
            </Text>
            {data.club.iban ? <Text style={{ marginTop: 6 }}>IBAN: {data.club.iban}</Text> : null}
          </View>
          <View style={s.sponsorBlock}>
            <Text style={s.sponsorName}>{data.sponsor.displayName}</Text>
            <Text style={{ marginTop: 4, color: "#525252", fontSize: 9 }}>
              {data.sponsor.email}
            </Text>
          </View>
        </View>

        {/* Meta */}
        <View style={s.meta}>
          <Text style={s.invoiceTitle}>
            {docTitle} {data.invoiceNumber}
          </Text>
          {isStorno ? (
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Storno zu Zahlungsübersicht</Text>
              <Text>{data.stornoOfNumber}</Text>
            </View>
          ) : null}
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Zeitraum</Text>
            <Text>{data.period}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>{isStorno ? "Stornodatum" : "Datum"}</Text>
            <Text>{issued}</Text>
          </View>
        </View>

        {/* Table */}
        <View style={s.tableHead}>
          <Text style={s.cellDate}>Datum</Text>
          <Text style={s.cellMatch}>Spiel</Text>
          <Text style={s.cellTrigger}>Anlass</Text>
          <Text style={s.cellAmount}>Betrag</Text>
        </View>
        {data.items.map((it, idx) => (
          <View key={idx} style={s.tableRow} wrap={false}>
            <Text style={s.cellDate}>{it.matchDate.toLocaleDateString("de-DE")}</Text>
            <Text style={s.cellMatch}>{it.matchLabel}</Text>
            <Text style={s.cellTrigger}>{it.triggerLabel}</Text>
            <Text style={s.cellAmount}>{eur(it.amountCents)}</Text>
          </View>
        ))}

        {/* Summary — nur der zugesagte Gesamtbetrag, kein USt-Block */}
        <View style={s.summary}>
          <View style={s.totalRow}>
            <Text>Gesamtbetrag</Text>
            <Text style={s.totalAmount}>{eur(total)}</Text>
          </View>
        </View>

        {isStorno ? (
          <Text style={s.noteText}>
            Dieser Stornobeleg hebt die oben referenzierte Zahlungsübersicht auf. Bereits
            gezahlte Beträge werden erstattet bzw. verrechnet. Es ist keine Zahlung erforderlich.
          </Text>
        ) : null}

        {/* Zahlungs-Block — IBAN prominent + Girocode-QR rechts (sofern beide
            vorhanden). Banking-App scannt → SEPA-Formular vorausgefüllt. */}
        {!isStorno && (data.club.iban || data.club.paypalHandle || data.club.stripePaymentLink) ? (
          <View style={s.payBox} wrap={false}>
            <View style={s.payBoxText}>
              <Text style={s.payBoxLabel}>Zahlung</Text>
              {data.club.iban ? (
                <View>
                  <Text>
                    Dein zugesagter Unterstützungsbeitrag: bitte überweise {eur(total)} innerhalb von 14 Tagen an:
                  </Text>
                  <Text style={[s.payBoxIban, { marginTop: 4 }]}>
                    {data.club.name}
                  </Text>
                  <Text style={s.payBoxIban}>IBAN: {data.club.iban}</Text>
                  <Text style={s.payBoxMeta}>
                    Verwendungszweck: {data.invoiceNumber}
                  </Text>
                </View>
              ) : (
                <Text>
                  Dein zugesagter Unterstützungsbeitrag: bitte zahle {eur(total)} innerhalb von
                  14 Tagen über einen der folgenden Wege:
                </Text>
              )}
              {data.club.paypalHandle ? (
                <Text style={s.payLinkRow}>
                  PayPal:{" "}
                  <Link src={paypalMeUrl(data.club.paypalHandle)} style={s.payLink}>
                    paypal.me/{data.club.paypalHandle}
                  </Link>
                </Text>
              ) : null}
              {data.club.stripePaymentLink ? (
                <Text style={s.payLinkRow}>
                  Online zahlen:{" "}
                  <Link src={data.club.stripePaymentLink} style={s.payLink}>
                    {data.club.stripePaymentLink}
                  </Link>
                </Text>
              ) : null}
            </View>
            {data.girocodeDataUrl ? (
              <View style={s.qrWrap}>
                <Image src={data.girocodeDataUrl} style={s.qrImage} />
                <Text style={s.qrCaption}>Mit Banking-App scannen</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Footer — Tier-abhängig (Pricing v2):
            Basic: KickPact-Branding sichtbar.
            Pro / Vereinslizenz: Vereins-Branding ohne KickPact-Hinweis. */}
        <Text style={s.footer} fixed>
          {isStorno
            ? "Stornobeleg — keine Zahlung erforderlich."
            : `Zugesagter Unterstützungsbeitrag: bitte innerhalb von 14 Tagen überweisen${data.club.iban ? ` (IBAN ${data.club.iban})` : ""}.`}
          {"\n"}
          {(data.plan ?? "basic") === "basic"
            ? "Erzeugt mit KickPact · Performance-Sponsoring im Amateurfußball · kickpact.com"
            : `${data.club.name} · ${data.club.address.zip} ${data.club.address.city}`}
        </Text>
      </Page>
    </Document>
  );
}
