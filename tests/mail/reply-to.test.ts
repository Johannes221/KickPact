import { describe, expect, it } from "vitest";
import {
  KICKPACT_REPLY_TO,
  deriveReplyTo,
  highestPlanFrom
} from "@/lib/mail/reply-to-pure";

describe("highestPlanFrom", () => {
  it("leeres Array → basic", () => {
    expect(highestPlanFrom([])).toBe("basic");
  });

  it("gewinnt verein über pro über basic", () => {
    expect(highestPlanFrom(["basic", "pro", "verein"])).toBe("verein");
    expect(highestPlanFrom(["basic", "basic", "pro"])).toBe("pro");
    expect(highestPlanFrom(["basic", "basic"])).toBe("basic");
    expect(highestPlanFrom(["verein"])).toBe("verein");
  });
});

describe("deriveReplyTo", () => {
  it("basic → noreply@kickpact.de", () => {
    expect(deriveReplyTo("basic", "fc-musterstadt")).toBe(KICKPACT_REPLY_TO);
  });

  it("pro → <slug>@kickpact.de", () => {
    expect(deriveReplyTo("pro", "fc-musterstadt")).toBe(
      "fc-musterstadt@kickpact.de"
    );
  });

  it("verein → <slug>@kickpact.de", () => {
    expect(deriveReplyTo("verein", "tsv-baden")).toBe("tsv-baden@kickpact.de");
  });
});
