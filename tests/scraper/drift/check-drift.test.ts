import { describe, it, expect } from "vitest";
import { diffArray, renderMarkdown } from "../../../scripts/drift/check-drift";
import type { FieldSchema } from "../../../scripts/drift/diff-fields";

describe("diffArray", () => {
  it("returns no drifts when items match schema", () => {
    const schema: Record<string, FieldSchema> = {
      "items[].name": { type: "string", minLength: 1 },
    };
    const items = [{ name: "Alpha" }, { name: "Beta" }];
    expect(diffArray("searchVereine", schema, items)).toEqual([]);
  });

  it("detects type drift when field has wrong type", () => {
    const schema: Record<string, FieldSchema> = {
      "items[].name": { type: "number" },
    };
    const items = [{ name: "Alpha" }];
    const drifts = diffArray("searchVereine", schema, items);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].field).toBe("name");
    expect(drifts[0].reason).toContain("type");
  });

  it("deduplicates the same drift across multiple items", () => {
    const schema: Record<string, FieldSchema> = {
      "items[].name": { type: "number" },
    };
    const items = [{ name: "A" }, { name: "B" }, { name: "C" }];
    const drifts = diffArray("searchVereine", schema, items);
    expect(drifts).toHaveLength(1);
  });

  it("strips events[] prefix from path", () => {
    const schema: Record<string, FieldSchema> = {
      "events[].minute": { type: "number", max: 130 },
    };
    const items = [{ minute: 200 }];
    const drifts = diffArray("getSpielDetails", schema, items);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].field).toBe("minute");
  });

  it("supports nested dot-paths after prefix strip", () => {
    const schema: Record<string, FieldSchema> = {
      "items[].team.id": { type: "string" },
    };
    const items = [{ team: { id: 42 } }];
    const drifts = diffArray("getMannschaften", schema, items);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].field).toBe("team.id");
  });
});

describe("renderMarkdown", () => {
  it("renders no-drift report when drifts empty", () => {
    const md = renderMarkdown("dossenheim", []);
    expect(md).toContain("dossenheim");
    expect(md).toContain("No drift");
  });

  it("includes drift count and each field in report", () => {
    const md = renderMarkdown("dossenheim", [
      { field: "name", expected: { type: "string" }, actual: 42, reason: "expected type string, got number" },
      { field: "minute", expected: { type: "number", max: 130 }, actual: 200, reason: "above max 130" },
    ]);
    expect(md).toContain("(2)");
    expect(md).toContain("`name`");
    expect(md).toContain("`minute`");
    expect(md).toContain("above max 130");
  });

  it("includes recommended action when drifts present", () => {
    const md = renderMarkdown("dossenheim", [
      { field: "name", expected: { type: "string" }, actual: 42, reason: "type mismatch" },
    ]);
    expect(md).toContain("Recommended Action");
    expect(md).toContain("lib/crawler/fussballde.ts");
  });
});
