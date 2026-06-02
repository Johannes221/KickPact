import { describe, expect, it } from "vitest";
import { buildReferralShareUrl, referralShareText } from "@/lib/referral/link";

describe("buildReferralShareUrl", () => {
  it("hängt ref=<sponsorId> an die Root-URL", () => {
    expect(buildReferralShareUrl("https://kickpact.de", "spn_abc")).toBe(
      "https://kickpact.de/?ref=spn_abc"
    );
  });

  it("normalisiert trailing slashes", () => {
    expect(buildReferralShareUrl("https://kickpact.de/", "spn_abc")).toBe(
      "https://kickpact.de/?ref=spn_abc"
    );
    expect(buildReferralShareUrl("https://kickpact.de///", "spn_abc")).toBe(
      "https://kickpact.de/?ref=spn_abc"
    );
  });

  it("url-encodet die sponsorId", () => {
    expect(buildReferralShareUrl("https://kickpact.de", "a b/c")).toBe(
      "https://kickpact.de/?ref=a%20b%2Fc"
    );
  });
});

describe("referralShareText", () => {
  it("enthält die übergebene URL", () => {
    const url = "https://kickpact.de/?ref=x";
    expect(referralShareText(url)).toContain(url);
  });
});
