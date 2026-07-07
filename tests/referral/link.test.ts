import { describe, expect, it } from "vitest";
import { buildReferralShareUrl, referralShareText } from "@/lib/referral/link";

describe("buildReferralShareUrl", () => {
  it("führt auf die Root-URL (keine interne ID im Link)", () => {
    expect(buildReferralShareUrl("https://kickpact.de")).toBe(
      "https://kickpact.de/"
    );
  });

  it("normalisiert trailing slashes", () => {
    expect(buildReferralShareUrl("https://kickpact.de/")).toBe(
      "https://kickpact.de/"
    );
    expect(buildReferralShareUrl("https://kickpact.de///")).toBe(
      "https://kickpact.de/"
    );
  });
});

describe("referralShareText", () => {
  it("enthält die übergebene URL", () => {
    const url = "https://kickpact.de/";
    expect(referralShareText(url)).toContain(url);
  });
});
