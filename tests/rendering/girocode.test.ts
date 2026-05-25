/**
 * EPC069-12 / Girocode payload + data-URL rendering.
 *
 * Spec-anchor tests — payload layout MUST stay byte-stable, banking apps
 * are strict about line order and the missing-BIC line.
 */
import { describe, it, expect } from "vitest";
import { buildGirocodePayload, renderGirocodeDataUrl } from "../../lib/invoicing/girocode";

describe("buildGirocodePayload", () => {
  it("produces EPC-conformant 11-line payload", () => {
    const payload = buildGirocodePayload({
      beneficiaryName: "FC Sportfreunde 1910 Dossenheim",
      iban: "DE89 3704 0044 0532 0130 00",
      amountCents: 1500,
      remittance: "KP-2026-0001"
    });

    const lines = payload.split("\n");
    expect(lines).toHaveLength(11);
    expect(lines[0]).toBe("BCD");
    expect(lines[1]).toBe("002");
    expect(lines[2]).toBe("1");
    expect(lines[3]).toBe("SCT");
    // BIC intentionally empty (clubs table has no BIC col yet — apps resolve)
    expect(lines[4]).toBe("");
    expect(lines[5]).toBe("FC Sportfreunde 1910 Dossenheim");
    // IBAN stripped of spaces + uppercased
    expect(lines[6]).toBe("DE89370400440532013000");
    // Amount with dot, no thousands sep
    expect(lines[7]).toBe("EUR15.00");
    // Purpose code + structured ref intentionally blank
    expect(lines[8]).toBe("");
    expect(lines[9]).toBe("");
    expect(lines[10]).toBe("KP-2026-0001");
  });

  it("includes BIC when explicitly provided", () => {
    const payload = buildGirocodePayload({
      beneficiaryName: "Test",
      iban: "DE89370400440532013000",
      bic: "COBADEFFXXX",
      amountCents: 100,
      remittance: "ref"
    });
    const lines = payload.split("\n");
    expect(lines[4]).toBe("COBADEFFXXX");
  });

  it("truncates beneficiary name at 70 chars (EPC limit)", () => {
    const longName = "A".repeat(120);
    const payload = buildGirocodePayload({
      beneficiaryName: longName,
      iban: "DE89370400440532013000",
      amountCents: 100,
      remittance: "x"
    });
    const lines = payload.split("\n");
    expect(lines[5]).toHaveLength(70);
  });

  it("truncates unstructured remittance at 140 chars (EPC limit)", () => {
    const longRef = "X".repeat(200);
    const payload = buildGirocodePayload({
      beneficiaryName: "Test",
      iban: "DE89370400440532013000",
      amountCents: 100,
      remittance: longRef
    });
    const lines = payload.split("\n");
    expect(lines[10]).toHaveLength(140);
  });

  it("formats amount with exactly two decimals", () => {
    const p = buildGirocodePayload({
      beneficiaryName: "T",
      iban: "DE89370400440532013000",
      amountCents: 7,
      remittance: "x"
    });
    expect(p.split("\n")[7]).toBe("EUR0.07");

    const p2 = buildGirocodePayload({
      beneficiaryName: "T",
      iban: "DE89370400440532013000",
      amountCents: 123456,
      remittance: "x"
    });
    expect(p2.split("\n")[7]).toBe("EUR1234.56");
  });
});

describe("renderGirocodeDataUrl", () => {
  it("returns a data:image/png base64 URL for a valid IBAN", async () => {
    const url = await renderGirocodeDataUrl({
      beneficiaryName: "FC Test",
      iban: "DE89370400440532013000",
      amountCents: 500,
      remittance: "KP-2026-0042"
    });
    expect(url).toMatch(/^data:image\/png;base64,/);
    // Sanity: non-empty payload after the prefix.
    expect((url ?? "").length).toBeGreaterThan(200);
  });

  it("returns null when IBAN is missing", async () => {
    const url = await renderGirocodeDataUrl({
      beneficiaryName: "Anon Verein",
      iban: null,
      amountCents: 1000,
      remittance: "ref"
    });
    expect(url).toBeNull();
  });
});
