import { describe, expect, it } from "vitest";
import { buildReminderText, invoiceNumberFromPdfUrl } from "@/lib/invoicing/reminder-text";

const BASE = {
  sponsorName: "Familie Müller",
  invoiceNumber: "KP-2026-0042",
  amountEur: "15,00 €",
  dueSinceDays: 21,
  clubName: "FC Sportfreunde 1910 Dossenheim",
  paymentOptions: {
    iban: "DE89 3704 0044 0532 0130 00",
    paypalHandle: "fcdossenheim",
    stripePaymentLink: "https://buy.stripe.com/test_abc"
  }
};

describe("buildReminderText", () => {
  it("liefert Subject mit Rechnungsnummer", () => {
    const { subject } = buildReminderText(BASE);
    expect(subject).toContain("KP-2026-0042");
    expect(subject.toLowerCase()).toContain("erinnerung");
  });

  it("Body: persönliche Anrede, Betrag, Verein, Zahlwege, freundlicher Ton", () => {
    const { body } = buildReminderText(BASE);
    expect(body).toContain("Hi Familie Müller");
    expect(body).toContain("15,00 €");
    expect(body).toContain("FC Sportfreunde 1910 Dossenheim");
    expect(body).toContain("KP-2026-0042");
    // Zahlwege aus payment-options
    expect(body).toContain("DE89 3704 0044 0532 0130 00");
    expect(body).toContain("https://paypal.me/fcdossenheim");
    expect(body).toContain("https://buy.stripe.com/test_abc");
    // freundlich, kein Mahn-Vokabular
    expect(body.toLowerCase()).not.toContain("mahnung");
    expect(body.toLowerCase()).not.toContain("inkasso");
    expect(body).toContain("Danke");
  });

  it("nennt die offene Zeit in Tagen", () => {
    const { body } = buildReminderText(BASE);
    expect(body).toContain("21 Tagen");
  });

  it("dueSinceDays <= 0 → keine Tages-Angabe, neutrale Formulierung", () => {
    const { body } = buildReminderText({ ...BASE, dueSinceDays: 0 });
    expect(body).not.toContain("0 Tagen");
    expect(body).toContain("noch offen");
  });

  it("ohne Zahlwege: kein Zahlwege-Block", () => {
    const { body } = buildReminderText({
      ...BASE,
      paymentOptions: { iban: null, paypalHandle: null, stripePaymentLink: null }
    });
    expect(body).not.toContain("PayPal");
    expect(body).not.toContain("Überweisung:");
  });
});

describe("invoiceNumberFromPdfUrl", () => {
  it("extrahiert KP-Nummer aus r2-Storage-URL", () => {
    expect(
      invoiceNumberFromPdfUrl("r2://kickpact/clubid123/KP-2026-0042.pdf")
    ).toBe("KP-2026-0042");
  });

  it("extrahiert KP-Nummer aus local-Storage-URL (Slashes → Unterstriche)", () => {
    expect(invoiceNumberFromPdfUrl("local://clubid123_KP-2026-0042.pdf")).toBe(
      "KP-2026-0042"
    );
  });

  it("null/unbekanntes Format → null", () => {
    expect(invoiceNumberFromPdfUrl(null)).toBeNull();
    expect(invoiceNumberFromPdfUrl("r2://bucket/whatever.pdf")).toBeNull();
  });
});
