import { describe, it, expect } from "vitest";
import { isAppleIapConfigured } from "@/lib/apple/verifier";

describe("isAppleIapConfigured", () => {
  it("is false when no APPLE_IAP env is set", () => {
    const prev = process.env.APPLE_IAP_BUNDLE_ID;
    delete process.env.APPLE_IAP_BUNDLE_ID;
    expect(isAppleIapConfigured()).toBe(false);
    if (prev) process.env.APPLE_IAP_BUNDLE_ID = prev;
  });
});
