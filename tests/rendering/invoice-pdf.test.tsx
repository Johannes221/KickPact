/**
 * Snapshot + field-assertion tests for the InvoicePdf component.
 *
 * Adapted from the original plan (Phase 6, Task 6.1): the real component is
 * `InvoicePdf` (not `InvoiceDocument`) exported from `lib/invoicing/builder.tsx`
 * and the data shape is richer than the plan's fixture (split address fields,
 * sponsor.type, items have matchDate/triggerLabel etc.).
 *
 * Font handling: builder.tsx now uses self-hosted Inter TTFs under
 * public/fonts/inter/ (rsms.me dropped /font-files/*.otf in May 2026 → 404).
 * Tests therefore render with the real local fonts — no mocks required.
 */
import { describe, it, expect } from "vitest";
import React from "react";

import { renderToBuffer } from "@react-pdf/renderer";
import { PDFParse } from "pdf-parse";
import { InvoicePdf, type InvoiceData } from "../../lib/invoicing/builder";
import { renderGirocodeDataUrl } from "../../lib/invoicing/girocode";

async function extractText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

const INVOICE_FIXTURE: InvoiceData = {
  invoiceNumber: "2026-05-001",
  period: "2026-05",
  issuedAt: new Date("2026-05-31T12:00:00Z"),
  club: {
    name: "FC Sportfreunde 1910 Dossenheim",
    address: { street: "Bahnhofstr. 1", zip: "69221", city: "Dossenheim" },
    taxId: "DE123456789",
    iban: "DE89 3704 0044 0532 0130 00",
    isSmallBusiness: true,
  },
  sponsor: {
    displayName: "Familie Müller",
    email: "familie.mueller@example.com",
    type: "familie",
    businessName: null,
    businessAddress: null,
  },
  items: [
    {
      matchDate: new Date("2026-05-01T15:00:00Z"),
      matchLabel: "FC Dossenheim vs. TSV Handschuhsheim",
      triggerLabel: "Tor",
      amountCents: 500,
    },
    {
      matchDate: new Date("2026-05-01T15:00:00Z"),
      matchLabel: "FC Dossenheim vs. TSV Handschuhsheim",
      triggerLabel: "Sieg",
      amountCents: 1000,
    },
  ],
};

describe("Invoice PDF — InvoicePdf component", () => {
  it("renders all key fields in PDF text", async () => {
    const buffer = await renderToBuffer(<InvoicePdf data={INVOICE_FIXTURE} />);
    // PDF text extraction inserts newlines wherever the layout wraps; normalize
    // whitespace before substring assertions.
    const text = (await extractText(buffer)).replace(/\s+/g, " ");

    expect(text).toContain("FC Sportfreunde 1910 Dossenheim");
    expect(text).toContain("Familie Müller");
    expect(text).toContain("2026-05-001");
    // 1500 cents = 15,00 € (de-DE formatting → "15,00")
    expect(text).toContain("15,00");
    expect(text).toContain("DE89 3704 0044 0532 0130 00");
    // §19 UStG hint when isSmallBusiness
    expect(text).toMatch(/§\s*19/);
    expect(text.toLowerCase()).toContain("umsatzsteuer");
  }, 30_000);

  it("renders all line items (matchLabel + triggerLabel)", async () => {
    const buffer = await renderToBuffer(<InvoicePdf data={INVOICE_FIXTURE} />);
    const text = (await extractText(buffer)).replace(/\s+/g, " ");
    for (const item of INVOICE_FIXTURE.items) {
      expect(text).toContain(item.matchLabel);
      expect(text).toContain(item.triggerLabel);
    }
  }, 30_000);

  it("snapshot — text content stable across runs", async () => {
    const buffer = await renderToBuffer(<InvoicePdf data={INVOICE_FIXTURE} />);
    const text = (await extractText(buffer)).replace(/\s+/g, " ").trim();
    expect(text).toMatchSnapshot();
  }, 30_000);

  it("basic plan: footer contains 'KickPact' branding", async () => {
    const buffer = await renderToBuffer(
      <InvoicePdf data={{ ...INVOICE_FIXTURE, plan: "basic" }} />
    );
    const text = await extractText(buffer);
    expect(text).toContain("KickPact");
    expect(text).toContain("kickpact.de");
  }, 30_000);

  it("pro plan: footer does NOT contain 'KickPact' branding (Vereins-Footer only)", async () => {
    const buffer = await renderToBuffer(
      <InvoicePdf data={{ ...INVOICE_FIXTURE, plan: "pro" }} />
    );
    const text = await extractText(buffer);
    // Vereins-Adresse statt KickPact-Hinweis
    expect(text).toContain(INVOICE_FIXTURE.club.address.city);
    // KickPact-Hinweis darf NICHT mehr im Footer-Bereich auftauchen
    // (das Wort "KickPact" steht sonst nirgends auf der Rechnung)
    expect(text).not.toContain("kickpact.de");
  }, 30_000);

  it("verein plan: footer does NOT contain 'KickPact' branding", async () => {
    const buffer = await renderToBuffer(
      <InvoicePdf data={{ ...INVOICE_FIXTURE, plan: "verein" }} />
    );
    const text = await extractText(buffer);
    expect(text).not.toContain("kickpact.de");
  }, 30_000);

  it("pay-box renders IBAN + Verwendungszweck (invoice number)", async () => {
    const buffer = await renderToBuffer(<InvoicePdf data={INVOICE_FIXTURE} />);
    const text = (await extractText(buffer)).replace(/\s+/g, " ");
    expect(text.toLowerCase()).toContain("zahlung");
    expect(text).toContain("Verwendungszweck: 2026-05-001");
  }, 30_000);

  it("pay-box renders QR-caption when girocodeDataUrl provided", async () => {
    const girocodeDataUrl = await renderGirocodeDataUrl({
      beneficiaryName: INVOICE_FIXTURE.club.name,
      iban: INVOICE_FIXTURE.club.iban,
      amountCents: 1500,
      remittance: INVOICE_FIXTURE.invoiceNumber
    });
    expect(girocodeDataUrl).toMatch(/^data:image\/png;base64,/);

    const buffer = await renderToBuffer(
      <InvoicePdf data={{ ...INVOICE_FIXTURE, girocodeDataUrl }} />
    );
    // pdf-parse may insert hyphen + linebreak inside long words; strip both
    // soft-wrapping hyphens and whitespace before substring matching.
    const text = (await extractText(buffer)).replace(/-\s+/g, "").replace(/\s+/g, " ");
    // The PNG itself is opaque to pdf-parse, but the caption below it is text.
    expect(text).toContain("Mit Banking-App scannen");
  }, 30_000);

  it("pay-box omitted entirely when IBAN missing", async () => {
    const buffer = await renderToBuffer(
      <InvoicePdf
        data={{
          ...INVOICE_FIXTURE,
          club: { ...INVOICE_FIXTURE.club, iban: null }
        }}
      />
    );
    const text = (await extractText(buffer)).replace(/\s+/g, " ");
    expect(text).not.toContain("Verwendungszweck");
    expect(text).not.toContain("Mit Banking-App scannen");
  }, 30_000);

  it("non-small-business: shows USt-Zwischensumme + 19 % USt row", async () => {
    const buffer = await renderToBuffer(
      <InvoicePdf
        data={{
          ...INVOICE_FIXTURE,
          club: { ...INVOICE_FIXTURE.club, isSmallBusiness: false },
        }}
      />
    );
    const text = await extractText(buffer);
    expect(text.toLowerCase()).toContain("zwischensumme");
    expect(text).toMatch(/19\s*%/);
  }, 30_000);
});
