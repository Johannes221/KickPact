import { describe, it, expect } from "vitest";
import { generateKeyPairSync, createPrivateKey } from "node:crypto";
import { normalizeApplePrivateKey } from "@/lib/apple/normalize-key";

// Ein echter EC-P256-Key im PKCS8-PEM (wie Apples .p8), damit wir gegen
// crypto.createPrivateKey verifizieren können statt gegen Fixtures.
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const validPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString().trim();

describe("normalizeApplePrivateKey", () => {
  it("lässt ein korrektes mehrzeiliges PEM gültig (No-op)", () => {
    const out = normalizeApplePrivateKey(validPem);
    expect(() => createPrivateKey(out)).not.toThrow();
  });

  it("repariert ein zu einer Zeile zerquetschtes PEM (Coolify-Fall)", () => {
    const oneLine = validPem.replace(/\n/g, " "); // Umbrüche → Spaces
    expect(oneLine.includes("\n")).toBe(false);
    const out = normalizeApplePrivateKey(oneLine);
    expect(out.split("\n").length).toBeGreaterThanOrEqual(3);
    expect(() => createPrivateKey(out)).not.toThrow();
  });

  it("repariert PEM ohne jeden Umbruch, Header intakt (Body direkt angehängt)", () => {
    // realistischer Coolify-Fall: Umbrüche verschwinden, "BEGIN PRIVATE KEY"
    // behält seine Leerzeichen.
    const noBreaks = validPem.replace(/\n/g, "");
    expect(noBreaks.includes("\n")).toBe(false);
    const out = normalizeApplePrivateKey(noBreaks);
    expect(() => createPrivateKey(out)).not.toThrow();
  });

  it("wandelt \\n-escaped in echte Umbrüche", () => {
    const escaped = validPem.replace(/\n/g, "\\n");
    const out = normalizeApplePrivateKey(escaped);
    expect(() => createPrivateKey(out)).not.toThrow();
  });
});
