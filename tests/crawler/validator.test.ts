import { describe, it, expect } from "vitest";
import { validateSpielListItem, validateSpielDetails } from "@/lib/crawler/validator";
import type { SpielListItem, SpielDetails } from "@/lib/crawler/fussballde";

// Helpers -------------------------------------------------------------------

function listItem(overrides: Partial<SpielListItem> = {}): SpielListItem {
  return {
    spielId: "ABCDEF12",
    slug: "sv-muster-vs-fc-test",
    datum: "15.03.2026",
    heim: "SV Musterhausen",
    gast: "FC Testdorf",
    ergebnis: "2:1",
    vergangen: true,
    url: "https://www.fussball.de/spiel/sv-muster-vs-fc-test/-/spiel/ABCDEF12",
    ...overrides
  };
}

function details(overrides: Partial<SpielDetails> = {}): SpielDetails {
  return {
    spielId: "ABCDEF12",
    heim: "SV Musterhausen",
    gast: "FC Testdorf",
    heimTeamId: null,
    gastTeamId: null,
    ergebnis: { heim: 2, gast: 1 },
    halbzeit: { heim: 1, gast: 0 },
    events: [],
    ...overrides
  };
}

// validateSpielListItem -----------------------------------------------------

describe("validateSpielListItem", () => {
  it("accepts a clean list item", () => {
    expect(validateSpielListItem(listItem()).valid).toBe(true);
  });

  it("rejects empty spielId", () => {
    expect(validateSpielListItem(listItem({ spielId: "" })).valid).toBe(false);
  });

  it("rejects spielId that is too short", () => {
    expect(validateSpielListItem(listItem({ spielId: "ABC" })).valid).toBe(false);
  });

  it("rejects spielId with special characters", () => {
    expect(validateSpielListItem(listItem({ spielId: "ABC-DEF!@" })).valid).toBe(false);
  });

  it("rejects datum with wrong format", () => {
    expect(validateSpielListItem(listItem({ datum: "2026-03-15" })).valid).toBe(false);
    expect(validateSpielListItem(listItem({ datum: "15/03/2026" })).valid).toBe(false);
    expect(validateSpielListItem(listItem({ datum: "" })).valid).toBe(false);
  });

  it("rejects impossible dates", () => {
    expect(validateSpielListItem(listItem({ datum: "99.99.2026" })).valid).toBe(false);
  });

  it("rejects future dates", () => {
    const nextYear = new Date().getFullYear() + 1;
    expect(validateSpielListItem(listItem({ datum: `15.03.${nextYear}` })).valid).toBe(false);
  });

  it("rejects dates older than 4 years", () => {
    const oldYear = new Date().getFullYear() - 5;
    expect(validateSpielListItem(listItem({ datum: `15.03.${oldYear}` })).valid).toBe(false);
  });

  it("accepts a date exactly 3 years ago", () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 3);
    const datum = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
    expect(validateSpielListItem(listItem({ datum })).valid).toBe(true);
  });

  it("rejects empty team name", () => {
    expect(validateSpielListItem(listItem({ heim: "" })).valid).toBe(false);
    expect(validateSpielListItem(listItem({ gast: "" })).valid).toBe(false);
  });

  it("rejects team name with no letters (only numbers)", () => {
    expect(validateSpielListItem(listItem({ heim: "1234" })).valid).toBe(false);
  });

  it("rejects HTML artifact in team name", () => {
    expect(validateSpielListItem(listItem({ heim: "<div>club</div>" })).valid).toBe(false);
    expect(validateSpielListItem(listItem({ gast: "undefined" })).valid).toBe(false);
  });

  it("accepts team name with numbers and letters (common in amateur clubs)", () => {
    expect(validateSpielListItem(listItem({ heim: "FC 08 Augsburg" })).valid).toBe(true);
    expect(validateSpielListItem(listItem({ gast: "TSV 1860 München" })).valid).toBe(true);
  });
});

// validateSpielDetails ------------------------------------------------------

describe("validateSpielDetails", () => {
  it("accepts clean details", () => {
    expect(validateSpielDetails(details()).valid).toBe(true);
  });

  it("accepts 0:0 draw", () => {
    expect(validateSpielDetails(details({ ergebnis: { heim: 0, gast: 0 }, halbzeit: { heim: 0, gast: 0 } })).valid).toBe(true);
  });

  it("accepts high but plausible amateur score (12:0)", () => {
    expect(
      validateSpielDetails(details({ ergebnis: { heim: 12, gast: 0 }, halbzeit: { heim: 6, gast: 0 } })).valid
    ).toBe(true);
  });

  it("rejects score above MAX_SINGLE (26:0)", () => {
    const v = validateSpielDetails(details({ ergebnis: { heim: 26, gast: 0 }, halbzeit: null }));
    expect(v.valid).toBe(false);
    expect(v.reason).toMatch(/unplausibel/);
  });

  it("rejects score above MAX_TOTAL (18:18)", () => {
    const v = validateSpielDetails(details({ ergebnis: { heim: 18, gast: 18 }, halbzeit: null }));
    expect(v.valid).toBe(false);
    expect(v.reason).toMatch(/Gesamttore/);
  });

  it("rejects negative score", () => {
    expect(validateSpielDetails(details({ ergebnis: { heim: -1, gast: 2 } })).valid).toBe(false);
  });

  it("rejects half-time score greater than final score", () => {
    const v = validateSpielDetails(
      details({ ergebnis: { heim: 2, gast: 1 }, halbzeit: { heim: 3, gast: 0 } })
    );
    expect(v.valid).toBe(false);
    expect(v.reason).toMatch(/HZ Heim/);
  });

  it("rejects empty team name in details", () => {
    expect(validateSpielDetails(details({ heim: "" })).valid).toBe(false);
  });

  it("rejects HTML artifact in details team name", () => {
    expect(validateSpielDetails(details({ gast: "null" })).valid).toBe(false);
  });

  it("accepts no halbzeit (null)", () => {
    expect(validateSpielDetails(details({ halbzeit: null })).valid).toBe(true);
  });
});
