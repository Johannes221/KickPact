import { describe, it, expect } from "vitest";
import { inferSchema } from "../../../scripts/fixtures/build-manifest";

describe("inferSchema", () => {
  it("infers number type with min/max", () => {
    const samples = [{ minute: 12 }, { minute: 45 }, { minute: 90 }];
    const schema = inferSchema("events[]", samples);
    expect(schema["events[].minute"]).toEqual({
      type: "number",
      min: 12,
      max: 90,
    });
  });

  it("infers string enum when ≤5 unique values", () => {
    const samples = [{ side: "heim" }, { side: "gast" }, { side: "heim" }];
    const schema = inferSchema("events[]", samples);
    expect(schema["events[].side"]).toEqual({
      type: "string",
      enum: ["heim", "gast"],
    });
  });

  it("marks nullable when some samples are null", () => {
    const samples = [{ spielerId: "ABC" }, { spielerId: null }];
    const schema = inferSchema("events[]", samples);
    expect(schema["events[].spielerId"]).toMatchObject({
      type: "string",
      nullable: true,
    });
  });

  /**
   * Regression 2026-07-17: `saison` bekam ein Enum aus dem Capture-Wert
   * (`["2526"]`). getMannschaften nimmt aber gar keinen saison-Parameter,
   * sondern liefert immer die LAUFENDE Saison — ab dem Rollover am 15.07.
   * meldete der tägliche Drift-Job also „actual 2627" und legte ein Issue an,
   * ohne dass sich an fussball.de etwas geändert hatte. Ein Check, der jeden
   * Sommer garantiert falsch anschlägt, wird ignoriert und ist damit wertlos.
   */
  it("pinnt die Saison NICHT auf den Capture-Wert (driftet sonst jeden Sommer)", () => {
    const schema = inferSchema("items[]", [{ saison: "2526" }, { saison: "2526" }]);
    expect(schema["items[].saison"]).toEqual({ type: "string", pattern: "^\\d{4}$" });
    expect(schema["items[].saison"]).not.toHaveProperty("enum");
  });

  it("lässt strukturelle Enums unangetastet", () => {
    const schema = inferSchema("items[]", [{ status: "finished" }, { status: "scheduled" }]);
    expect(schema["items[].status"]).toMatchObject({
      type: "string",
      enum: ["finished", "scheduled"],
    });
  });
});
