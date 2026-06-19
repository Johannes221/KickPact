import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => vi.unstubAllGlobals());

async function loadWithUA(ua: string) {
  vi.stubGlobal("window", {
    navigator: { userAgent: ua },
    Capacitor: undefined
  });
  vi.resetModules();
  return await import("@/lib/billing/checkout-channel");
}

describe("getCheckoutChannel", () => {
  it("returns 'apple' inside the iOS app (KickPactApp UA)", async () => {
    const { getCheckoutChannel } = await loadWithUA("Mozilla/5.0 KickPactApp");
    expect(getCheckoutChannel()).toBe("apple");
  });

  it("returns 'stripe' on the web", async () => {
    const { getCheckoutChannel } = await loadWithUA("Mozilla/5.0 Safari");
    expect(getCheckoutChannel()).toBe("stripe");
  });
});
