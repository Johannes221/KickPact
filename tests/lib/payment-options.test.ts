import { describe, expect, it } from "vitest";
import {
  normalizePaypalHandle,
  validateStripePaymentLink,
  paypalMeUrl,
  buildPaymentOptionLines
} from "@/lib/invoicing/payment-options";

describe("normalizePaypalHandle", () => {
  it("akzeptiert einen nackten Handle", () => {
    expect(normalizePaypalHandle("fcmusterstadt")).toEqual({
      ok: true,
      handle: "fcmusterstadt"
    });
  });

  it("normalisiert paypal.me/<handle>", () => {
    expect(normalizePaypalHandle("paypal.me/fcmusterstadt")).toEqual({
      ok: true,
      handle: "fcmusterstadt"
    });
  });

  it("normalisiert @<handle>", () => {
    expect(normalizePaypalHandle("@fcmusterstadt")).toEqual({
      ok: true,
      handle: "fcmusterstadt"
    });
  });

  it("normalisiert https://paypal.me/<handle> (auch mit www. und Trailing-Slash)", () => {
    expect(normalizePaypalHandle("https://paypal.me/fcmusterstadt")).toEqual({
      ok: true,
      handle: "fcmusterstadt"
    });
    expect(normalizePaypalHandle("https://www.paypal.me/FCMusterstadt/")).toEqual({
      ok: true,
      handle: "FCMusterstadt"
    });
  });

  it("trimmt Whitespace", () => {
    expect(normalizePaypalHandle("  paypal.me/foo  ")).toEqual({ ok: true, handle: "foo" });
  });

  it("leerer Input → ok mit handle null (Feld löschen)", () => {
    expect(normalizePaypalHandle("")).toEqual({ ok: true, handle: null });
    expect(normalizePaypalHandle("   ")).toEqual({ ok: true, handle: null });
  });

  it("lehnt ungültige Zeichen ab", () => {
    const res = normalizePaypalHandle("fc musterstadt");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toBeTruthy();
    expect(normalizePaypalHandle("fc-musterstadt").ok).toBe(false);
    expect(normalizePaypalHandle("föö").ok).toBe(false);
  });

  it("lehnt überlange Handles ab (>20 Zeichen)", () => {
    expect(normalizePaypalHandle("a".repeat(21)).ok).toBe(false);
    expect(normalizePaypalHandle("a".repeat(20)).ok).toBe(true);
  });

  it("lehnt fremde URLs ab", () => {
    expect(normalizePaypalHandle("https://example.com/foo").ok).toBe(false);
  });
});

describe("validateStripePaymentLink", () => {
  it("akzeptiert https://buy.stripe.com/-Links", () => {
    expect(validateStripePaymentLink("https://buy.stripe.com/abc123")).toEqual({
      ok: true,
      url: "https://buy.stripe.com/abc123"
    });
  });

  it("trimmt Whitespace", () => {
    expect(validateStripePaymentLink("  https://buy.stripe.com/abc  ")).toEqual({
      ok: true,
      url: "https://buy.stripe.com/abc"
    });
  });

  it("leerer Input → ok mit url null (Feld löschen)", () => {
    expect(validateStripePaymentLink("")).toEqual({ ok: true, url: null });
  });

  it("lehnt alles ab, was nicht mit https://buy.stripe.com/ beginnt", () => {
    expect(validateStripePaymentLink("http://buy.stripe.com/abc").ok).toBe(false);
    expect(validateStripePaymentLink("https://stripe.com/abc").ok).toBe(false);
    expect(validateStripePaymentLink("https://buy.stripe.com.evil.de/x").ok).toBe(false);
    const res = validateStripePaymentLink("kein-link");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toBeTruthy();
  });
});

describe("paypalMeUrl", () => {
  it("baut die volle URL aus dem Handle", () => {
    expect(paypalMeUrl("foo")).toBe("https://paypal.me/foo");
  });
});

describe("buildPaymentOptionLines", () => {
  it("listet IBAN + PayPal + Stripe-Link, wenn vorhanden", () => {
    const lines = buildPaymentOptionLines({
      iban: "DE89 3704 0044 0532 0130 00",
      paypalHandle: "fcmuster",
      stripePaymentLink: "https://buy.stripe.com/abc",
      reference: "KP-2026-0001"
    });
    expect(lines).toEqual([
      "Überweisung: DE89 3704 0044 0532 0130 00 (Verwendungszweck: KP-2026-0001)",
      "PayPal: https://paypal.me/fcmuster",
      "Online zahlen: https://buy.stripe.com/abc"
    ]);
  });

  it("lässt fehlende Zahlwege weg", () => {
    expect(
      buildPaymentOptionLines({ iban: null, paypalHandle: "x", stripePaymentLink: null })
    ).toEqual(["PayPal: https://paypal.me/x"]);
    expect(
      buildPaymentOptionLines({ iban: null, paypalHandle: null, stripePaymentLink: null })
    ).toEqual([]);
  });

  it("IBAN ohne Referenz → ohne Verwendungszweck-Zusatz", () => {
    expect(
      buildPaymentOptionLines({ iban: "DE02", paypalHandle: null, stripePaymentLink: null })
    ).toEqual(["Überweisung: DE02"]);
  });
});
