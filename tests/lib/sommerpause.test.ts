import { describe, it, expect, afterEach, vi } from "vitest";
import { isSommerpause } from "@/lib/utils/sommerpause";

describe("isSommerpause", () => {
  afterEach(() => {
    delete process.env.SOMMERPAUSE_OVERRIDE_DISABLED;
    vi.restoreAllMocks();
  });

  it.each([
    // In Sommerpause
    ["2026-06-01", true],
    ["2026-06-15", true],
    ["2026-07-01", true],
    ["2026-07-31", true],
    // Not in Sommerpause
    ["2026-05-31", false],
    ["2026-08-01", false],
    ["2026-08-15", false],
    ["2026-09-01", false],
    ["2025-12-01", false],
    ["2026-03-15", false]
  ])("%s → %s", (dateStr, expected) => {
    expect(isSommerpause(new Date(dateStr))).toBe(expected);
  });

  it("returns false when SOMMERPAUSE_OVERRIDE_DISABLED=true", () => {
    process.env.SOMMERPAUSE_OVERRIDE_DISABLED = "true";
    expect(isSommerpause(new Date("2026-07-15"))).toBe(false);
  });
});
