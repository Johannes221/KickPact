import { describe, it, expect } from "vitest";
import { computeMatchHash } from "@/lib/crawler/fussballde";

describe("computeMatchHash", () => {
  const base = {
    ergebnisHeim: 2,
    ergebnisGast: 1,
    halbzeitHeim: 1,
    halbzeitGast: 0,
    events: [
      { minute: 12, type: "tor", side: "heim" as const, spielerId: "P1" },
      { minute: 45, type: "tor", side: "gast" as const, spielerId: "P9" },
      { minute: 80, type: "tor", side: "heim" as const, spielerId: "P2" },
    ],
  };

  it("identical input produces identical hash", () => {
    expect(computeMatchHash(base)).toBe(computeMatchHash(base));
  });

  it("hash changes when result changes", () => {
    const updated = { ...base, ergebnisHeim: 3 };
    expect(computeMatchHash(base)).not.toBe(computeMatchHash(updated));
  });

  it("hash changes when event count changes", () => {
    const more = {
      ...base,
      events: [
        ...base.events,
        { minute: 90, type: "tor", side: "heim" as const, spielerId: "P3" },
      ],
    };
    expect(computeMatchHash(base)).not.toBe(computeMatchHash(more));
  });

  it("hash changes when halftime score changes", () => {
    const updated = { ...base, halbzeitHeim: 2 };
    expect(computeMatchHash(base)).not.toBe(computeMatchHash(updated));
  });

  it("hash changes when an event's side changes", () => {
    const updated = {
      ...base,
      events: [
        { ...base.events[0], side: "gast" as const },
        base.events[1],
        base.events[2],
      ],
    };
    expect(computeMatchHash(base)).not.toBe(computeMatchHash(updated));
  });

  it("hash is order-independent for events", () => {
    const reordered = {
      ...base,
      events: [base.events[2], base.events[0], base.events[1]],
    };
    expect(computeMatchHash(base)).toBe(computeMatchHash(reordered));
  });

  it("treats undefined and null spielerId the same", () => {
    const withNull = {
      ...base,
      events: [
        { minute: 12, type: "tor", side: "heim" as const, spielerId: null },
      ],
    };
    const withUndef = {
      ...base,
      events: [{ minute: 12, type: "tor", side: "heim" as const }],
    };
    expect(computeMatchHash(withNull)).toBe(computeMatchHash(withUndef));
  });
});
