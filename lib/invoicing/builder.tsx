import { Document, Page, Text, View, Image, StyleSheet, Font } from "@react-pdf/renderer";
import path from "node:path";
import { eur } from "@/lib/utils/currency";

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
  summaryRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4, fontSize: 10 },
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
  ustNote: { marginTop: 24, fontSize: 9, color: "#525252", lineHeight: 1.5, maxWidth: 360 },
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

export interface InvoiceData {
  invoiceNumber: string;
  period: string;
  issuedAt: Date;
  /**
   * Pricing v2: Tier des Teams. Steuert Footer-Branding:
   *   - basic → KickPact-Footer "Powered by KickPact · kickpact.de"
   *   - pro / verein → Vereins-Footer ohne KickPact-Branding
   * Falls undefined → Default `basic` (sichere Annahme).
   */
  plan?: "basic" | "pro" | "verein";
  club: {
    name: string;
    address: { street: string; zip: string; city: string; country?: string };
    iban: string | null;
    taxId: string | null;
    isSmallBusiness: boolean;
  };
  sponsor: {
    displayName: string;
    email: string;
    type: "familie" | "business";
    businessName: string | null;
    businessAddress: { street: string; zip: string; city: string; country?: string } | null;
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
   * Wenn gesetzt, wird das Dokument als STORNORECHNUNG (Gutschrift) gerendert:
   * Titel "Stornorechnung", Referenz auf die Original-Rechnungsnummer, keine
   * Zahlungsaufforderung (Beträge sind negativ = Gutschrift).
   */
  stornoOfNumber?: string | null;
}

export function InvoicePdf({ data }: { data: InvoiceData }) {
  const subtotal = data.items.reduce((sum, i) => sum + i.amountCents, 0);
  const ust = data.club.isSmallBusiness ? 0 : Math.round(subtotal * 0.19);
  const total = subtotal + ust;
  const issued = data.issuedAt.toLocaleDateString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const isStorno = Boolean(data.stornoOfNumber);

  return (
    <Document
      title={`${isStorno ? "Stornorechnung" : "Rechnung"} ${data.invoiceNumber}`}
      author={data.club.name}
      subject={`KickPact-${isStorno ? "Stornorechnung" : "Rechnung"} für ${data.period}`}
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
            {data.club.taxId ? <Text style={{ marginTop: 6 }}>USt-IdNr: {data.club.taxId}</Text> : null}
            {data.club.iban ? <Text>IBAN: {data.club.iban}</Text> : null}
          </View>
          <View style={s.sponsorBlock}>
            {data.sponsor.type === "business" && data.sponsor.businessName ? (
              <View>
                <Text style={s.sponsorName}>{data.sponsor.businessName}</Text>
                {data.sponsor.businessAddress ? (
                  <View>
                    <Text>{data.sponsor.businessAddress.street}</Text>
                    <Text>
                      {data.sponsor.businessAddress.zip} {data.sponsor.businessAddress.city}
                    </Text>
                  </View>
                ) : null}
                <Text style={{ marginTop: 4, color: "#525252", fontSize: 9 }}>
                  z. Hd. {data.sponsor.displayName}
                </Text>
              </View>
            ) : (
              <Text style={s.sponsorName}>{data.sponsor.displayName}</Text>
            )}
            <Text style={{ marginTop: 4, color: "#525252", fontSize: 9 }}>
              {data.sponsor.email}
            </Text>
          </View>
        </View>

        {/* Meta */}
        <View style={s.meta}>
          <Text style={s.invoiceTitle}>
            {isStorno ? "Stornorechnung" : "Rechnung"} {data.invoiceNumber}
          </Text>
          {isStorno ? (
            <View style={s.metaRow}>
              <Text style={s.metaLabel}>Storno zu Rechnung</Text>
              <Text>{data.stornoOfNumber}</Text>
            </View>
          ) : null}
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>Leistungszeitraum</Text>
            <Text>{data.period}</Text>
          </View>
          <View style={s.metaRow}>
            <Text style={s.metaLabel}>{isStorno ? "Stornodatum" : "Rechnungsdatum"}</Text>
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

        {/* Summary */}
        <View style={s.summary}>
          {data.club.isSmallBusiness ? null : (
            <View style={s.summaryRow}>
              <Text>Zwischensumme</Text>
              <Text>{eur(subtotal)}</Text>
            </View>
          )}
          {data.club.isSmallBusiness ? null : (
            <View style={s.summaryRow}>
              <Text>zzgl. 19 % USt</Text>
              <Text>{eur(ust)}</Text>
            </View>
          )}
          <View style={s.totalRow}>
            <Text>Gesamtbetrag</Text>
            <Text style={s.totalAmount}>{eur(total)}</Text>
          </View>
        </View>

        {/* USt-Hinweis bei §19 */}
        {data.club.isSmallBusiness ? (
          <Text style={s.ustNote}>
            Gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen. Die Beträge sind als
            Bruttobeträge zu verstehen.
          </Text>
        ) : null}

        {/* Zahlungs-Block — IBAN prominent + Girocode-QR rechts (sofern beide
            vorhanden). Banking-App scannt → SEPA-Formular vorausgefüllt. */}
        {isStorno ? (
          <Text style={s.ustNote}>
            Diese Stornorechnung hebt die oben referenzierte Rechnung auf. Bereits
            gezahlte Beträge werden erstattet bzw. verrechnet. Es ist keine Zahlung erforderlich.
          </Text>
        ) : null}

        {!isStorno && data.club.iban ? (
          <View style={s.payBox} wrap={false}>
            <View style={s.payBoxText}>
              <Text style={s.payBoxLabel}>Zahlung</Text>
              <Text>
                Bitte überweise {eur(total)} innerhalb von 14 Tagen an:
              </Text>
              <Text style={[s.payBoxIban, { marginTop: 4 }]}>
                {data.club.name}
              </Text>
              <Text style={s.payBoxIban}>IBAN: {data.club.iban}</Text>
              <Text style={s.payBoxMeta}>
                Verwendungszweck: {data.invoiceNumber}
              </Text>
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
            ? "Stornorechnung — keine Zahlung erforderlich."
            : `Bitte überweisen Sie den Gesamtbetrag innerhalb von 14 Tagen${data.club.iban ? ` auf IBAN ${data.club.iban}` : ""}.`}
          {"\n"}
          {(data.plan ?? "basic") === "basic"
            ? "Erzeugt mit KickPact · Performance-Sponsoring im Amateurfußball · kickpact.de"
            : `${data.club.name} · ${data.club.address.zip} ${data.club.address.city}`}
        </Text>
      </Page>
    </Document>
  );
}
