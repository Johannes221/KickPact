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
});
