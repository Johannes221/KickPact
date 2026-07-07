import { describe, it, expect, vi } from "vitest";
import { withRetry } from "@/lib/crawler/fussballde";

describe("withRetry", () => {
  it("succeeds on first try without retry", async () => {
    const fn = vi.fn(async () => "ok");
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on transient error and eventually succeeds", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 3) throw new Error("net::ERR_TIMEOUT");
      return "ok";
    };
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("gives up after maxAttempts and re-throws last error", async () => {
    const fn = vi.fn(async () => {
      throw new Error("net::ERR_TIMEOUT");
    });
    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })
    ).rejects.toThrow(/ERR_TIMEOUT/);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("retries on HTTP 429 (rate-limited upstream)", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      if (calls < 2) throw new Error("HTTP 429 für https://fussball.de/x");
      return "ok";
    };
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("retries on request timeout (AbortSignal.timeout)", async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      // undici throws a DOMException named "TimeoutError" on AbortSignal.timeout
      if (calls < 2) throw new Error("The operation was aborted due to timeout");
      return "ok";
    };
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("does NOT retry on non-network errors", async () => {
    const fn = vi.fn(async () => {
      throw new Error("ParseError: missing element");
    });
    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 1 })
    ).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("backoff delays grow exponentially", async () => {
    const started = Date.now();
    let calls = 0;
    await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new Error("net::ERR_FAILED");
        return "ok";
      },
      { maxAttempts: 3, baseDelayMs: 50 }
    );
    const elapsed = Date.now() - started;
    // 1st retry delay = 50ms, 2nd retry delay = 100ms → at least 150ms total
    expect(elapsed).toBeGreaterThanOrEqual(50 + 100);
  });
});
