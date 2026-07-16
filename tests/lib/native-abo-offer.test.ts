import { describe, it, expect } from "vitest";
import {
  plansOfferedForPurchase,
  appleProductIdFor
} from "@/lib/stripe/pricing";

/**
 * Native IAP-Kauf-Angebot (Johannes-Wunsch 2026-07-16):
 * - Pro ist gekündigt → man muss Pro JEDERZEIT reaktivieren können (aktuelle
 *   Stufe wird angeboten), nicht nur „hoch auf Vereinslizenz".
 * - Läuft ein aktives Abo → nur echte Upgrades (kein Doppelkauf).
 * - Nie ein Downgrade über den nativen Kauf.
 */
describe("plansOfferedForPurchase", () => {
  it("Pro + gekündigt/inaktiv → Pro (reaktivieren) + Verein", () => {
    expect(plansOfferedForPurchase("pro", false)).toEqual(["pro", "verein"]);
  });

  it("Pro + aktiv → nur Verein (kein Doppelkauf der laufenden Stufe)", () => {
    expect(plansOfferedForPurchase("pro", true)).toEqual(["verein"]);
  });

  it("Basic + inaktiv → alle Stufen ab Basic", () => {
    expect(plansOfferedForPurchase("basic", false)).toEqual([
      "basic",
      "pro",
      "verein"
    ]);
  });

  it("Basic + aktiv → nur Upgrades (Pro, Verein)", () => {
    expect(plansOfferedForPurchase("basic", true)).toEqual(["pro", "verein"]);
  });

  it("Verein + inaktiv → Verein reaktivierbar", () => {
    expect(plansOfferedForPurchase("verein", false)).toEqual(["verein"]);
  });

  it("Verein + aktiv → nichts (höchste Stufe, kein Upgrade)", () => {
    expect(plansOfferedForPurchase("verein", true)).toEqual([]);
  });
});

describe("appleProductIdFor — beide Cycles pro Tier vorhanden", () => {
  it("mappt (plan, cycle) auf die exakte Apple-Product-ID", () => {
    expect(appleProductIdFor("pro", "monthly")).toBe("kickpact.pro.monthly");
    expect(appleProductIdFor("pro", "season_end")).toBe("kickpact.pro.season");
    expect(appleProductIdFor("verein", "season_end")).toBe(
      "kickpact.verein.season"
    );
  });

  it("liefert für jede der 3×2 Kombis eine ID (kein null-Loch)", () => {
    for (const plan of ["basic", "pro", "verein"] as const) {
      for (const cycle of ["monthly", "season_end"] as const) {
        expect(appleProductIdFor(plan, cycle)).toBeTruthy();
      }
    }
  });
});
