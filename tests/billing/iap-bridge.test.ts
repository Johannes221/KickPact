import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => vi.unstubAllGlobals());

describe("iap bridge (web-inert)", () => {
  it("purchase throws a clear error on web", async () => {
    vi.stubGlobal("window", { navigator: { userAgent: "Safari" } });
    vi.resetModules();
    const { purchase } = await import("@/lib/platform/iap");
    await expect(purchase("kickpact.pro.monthly")).rejects.toThrow(/App/i);
  });
});
