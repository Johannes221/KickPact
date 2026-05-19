import { describe, expect, it } from "vitest";

describe("Vitest sanity", () => {
  it("kann assertions evaluieren", () => {
    expect(1 + 1).toBe(2);
  });
});
