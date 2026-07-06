/**
 * Privatpersonen-only (Spec 2026-07-06, Erfolgskriterium 2):
 * Das Sponsor-Onboarding akzeptiert ausschließlich Privatpersonen —
 * Business-förmige Inputs werden von der Validation abgewiesen, und
 * defensives Lesen normalisiert Alt-Werte auf "familie".
 */
import { describe, expect, it } from "vitest";
import {
  sponsorOnboardingSchema,
  normalizeSponsorType
} from "@/lib/validations/sponsor";

describe("sponsorOnboardingSchema (Privatpersonen-only)", () => {
  it("akzeptiert einen privaten Sponsor (familie)", () => {
    const parsed = sponsorOnboardingSchema.parse({
      type: "familie",
      displayName: "Tante Erna",
      role: "verwandt",
      description: "Patentante von Schmidt"
    });
    expect(parsed.type).toBe("familie");
    expect(parsed.displayName).toBe("Tante Erna");
  });

  it("akzeptiert minimalen Input ohne Rolle/Beschreibung", () => {
    const parsed = sponsorOnboardingSchema.parse({
      type: "familie",
      displayName: "Opa Heinz"
    });
    expect(parsed.role ?? "").toBe("");
  });

  it("weist type='business' ab (Pfad existiert nicht mehr)", () => {
    const res = sponsorOnboardingSchema.safeParse({
      type: "business",
      displayName: "Bäckerei Müller GmbH",
      businessName: "Bäckerei Müller GmbH",
      street: "Hauptstr. 1",
      zip: "69221",
      city: "Dossenheim"
    });
    expect(res.success).toBe(false);
  });

  it("kennt keine Business-Felder mehr (werden verworfen, kein Durchreichen)", () => {
    const parsed = sponsorOnboardingSchema.parse({
      type: "familie",
      displayName: "Onkel Tom",
      businessName: "Sollte ignoriert werden"
    });
    expect("businessName" in parsed).toBe(false);
  });
});

describe("normalizeSponsorType (inerter 'business'-Enum-Wert)", () => {
  it("normalisiert alles auf 'familie'", () => {
    expect(normalizeSponsorType("familie")).toBe("familie");
    expect(normalizeSponsorType("business")).toBe("familie");
    expect(normalizeSponsorType(null)).toBe("familie");
    expect(normalizeSponsorType(undefined)).toBe("familie");
  });
});
