import { describe, it, expect } from "vitest";
import { diffField } from "../../../scripts/drift/diff-fields";

describe("diffField", () => {
  it("type match — string expected, string got", () => {
    const d = diffField("name", { type: "string", minLength: 3 }, "Hello");
    expect(d).toBeNull();
  });

  it("type mismatch — string expected, number got", () => {
    const d = diffField("name", { type: "string" }, 42);
    expect(d).toMatchObject({ field: "name", reason: expect.stringContaining("type") });
  });

  it("enum violation", () => {
    const d = diffField("side", { type: "string", enum: ["heim", "gast"] }, "neutral");
    expect(d).toMatchObject({ field: "side", reason: expect.stringContaining("enum") });
  });

  it("nullable allows null", () => {
    const d = diffField("playerId", { type: "string", nullable: true }, null);
    expect(d).toBeNull();
  });

  it("non-nullable rejects null", () => {
    const d = diffField("matchId", { type: "string" }, null);
    expect(d).toMatchObject({ field: "matchId", reason: expect.stringContaining("null") });
  });

  it("number range violation", () => {
    const d = diffField("minute", { type: "number", min: 0, max: 130 }, 200);
    expect(d).toMatchObject({ field: "minute", reason: expect.stringContaining("max") });
  });

  it("tolerant whitespace in strings (when flagged)", () => {
    const d = diffField("ergebnis", { type: "string", enum: ["3:1"], tolerantWhitespace: true }, "3 : 1");
    expect(d).toBeNull();
  });
});
