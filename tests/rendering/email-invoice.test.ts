/**
 * Snapshot + field-assertion tests for the invoice emails (sponsor + club).
 *
 * Adapted from Phase 6, Task 6.3: KickPact ships two invoice email
 * templates — `invoiceSponsorEmail` (notice + PDF attachment to the sponsor)
 * and `invoiceClubEmail` (cc-copy to the club admin). Both are plain
 * functions returning `{ subject, html, text }`. The plan referenced a
 * single React `InvoiceEmail` component + `@react-email/render`; we cover
 * both real templates instead.
 */
import { describe, it, expect } from "vitest";
import { invoiceSponsorEmail } from "../../lib/mail/templates/invoice-sponsor";
import { invoiceClubEmail } from "../../lib/mail/templates/invoice-club";

const SPONSOR_FIXTURE = {
  sponsorName: "Familie Müller",
  clubName: "FC Sportfreunde 1910 Dossenheim",
  period: "Mai 2026",
  totalEur: "15,00 €",
  invoiceNumber: "2026-05-001",
  itemCount: 3
};

const CLUB_FIXTURE = {
  adminName: "Trainer Lukas",
  clubName: "FC Sportfreunde 1910 Dossenheim",
  sponsorName: "Familie Müller",
  period: "Mai 2026",
  totalEur: "15,00 €",
  invoiceNumber: "2026-05-001",
  itemCount: 3
};

describe("Invoice email — sponsor variant", () => {
  it("renders sponsor name, club, period, amount, invoice number", () => {
    const { subject, html, text } = invoiceSponsorEmail(SPONSOR_FIXTURE);
    expect(subject).toContain("2026-05-001");
    expect(subject).toContain("Mai 2026");
    expect(html).toContain("Familie Müller");
    expect(html).toContain("FC Sportfreunde 1910 Dossenheim");
    expect(html).toContain("Mai 2026");
    expect(html).toContain("15,00");
    expect(html).toContain("2026-05-001");
    expect(text).toContain("Familie Müller");
    expect(text).toContain("15,00");
  });

  it("html snapshot", () => {
    const { html } = invoiceSponsorEmail(SPONSOR_FIXTURE);
    expect(html.replace(/\s+/g, " ")).toMatchSnapshot();
  });
});

describe("Invoice email — club copy", () => {
  it("renders admin greeting, sponsor name, totals, period", () => {
    const { subject, html, text } = invoiceClubEmail(CLUB_FIXTURE);
    expect(subject).toContain("Familie Müller");
    expect(subject).toContain("Mai 2026");
    expect(html).toContain("Hi Trainer Lukas");
    expect(html).toContain("Familie Müller");
    expect(html).toContain("Mai 2026");
    expect(html).toContain("15,00");
    expect(html).toContain("2026-05-001");
    expect(text).toContain("Trainer Lukas");
    expect(text).toContain("FC Sportfreunde 1910 Dossenheim");
  });

  it("falls back to generic greeting when adminName is missing", () => {
    const { html, text } = invoiceClubEmail({ ...CLUB_FIXTURE, adminName: undefined });
    expect(html).toContain("Hallo,");
    expect(text).toContain("Hallo,");
  });

  it("html snapshot", () => {
    const { html } = invoiceClubEmail(CLUB_FIXTURE);
    expect(html.replace(/\s+/g, " ")).toMatchSnapshot();
  });
});
