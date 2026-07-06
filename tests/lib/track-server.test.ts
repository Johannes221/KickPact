/**
 * Plausible-Server-Tracking: Timeout-Härtung (Vibe-Check 2026-07-06 / M1).
 *
 * trackServer wird u.a. aus dem Stripe-Webhook aufgerufen. Ein hängendes
 * Plausible darf den Aufrufer nie stallen — der Fetch braucht ein
 * AbortSignal.timeout. Fehler (inkl. Timeout) werden geschluckt, nie geworfen.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

async function importTrackServer() {
  vi.resetModules();
  return import("@/lib/analytics/track-server");
}

describe("trackServer", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sendet den Plausible-Fetch mit Timeout-AbortSignal", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_PLAUSIBLE_DOMAIN", "kickpact.com");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal("fetch", fetchMock);

    const { trackServer } = await importTrackServer();
    await trackServer(
      "stripe_subscription_created",
      "https://kickpact.com/server/subscription"
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("Timeout/Abort wird geschluckt, nicht geworfen", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_PLAUSIBLE_DOMAIN", "kickpact.com");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"))
    );

    const { trackServer } = await importTrackServer();
    await expect(
      trackServer(
        "stripe_subscription_created",
        "https://kickpact.com/server/subscription"
      )
    ).resolves.toBeUndefined();
  });
});
