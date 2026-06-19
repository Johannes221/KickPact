import { describe, it, expect } from "vitest";
import { subscriptions, billingProviderEnum } from "@/lib/db/schema/billing";

describe("subscriptions provider columns", () => {
  it("exposes the billingProviderEnum with stripe/apple/google", () => {
    expect(billingProviderEnum.enumValues).toEqual(["stripe", "apple", "google"]);
  });

  it("has provider + apple identifier columns", () => {
    const cols = Object.keys(subscriptions);
    expect(cols).toContain("provider");
    expect(cols).toContain("appleOriginalTransactionId");
    expect(cols).toContain("appleExpiresAt");
  });
});
