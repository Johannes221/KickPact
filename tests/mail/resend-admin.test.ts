/**
 * Admin-Mail-Seite: Resend-API-Fetch mit Timeout (Vibe-Check 2026-07-06 / N2).
 *
 * fetchResendEmails rendert server-seitig die /admin/mail-Seite. Ohne
 * AbortSignal.timeout blockiert ein hängendes Resend das ganze Server-
 * Rendering. Fehler (inkl. Timeout) werden als error-String zurückgegeben,
 * nie geworfen.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchResendEmails } from "@/lib/mail/resend-admin";

describe("fetchResendEmails", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("ruft die Resend-API mit Timeout-AbortSignal auf", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] })
    });
    vi.stubGlobal("fetch", fetchMock);

    const { data, error } = await fetchResendEmails();

    expect(error).toBeNull();
    expect(data).toEqual([]);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("Timeout/Abort ⇒ error-String statt Throw", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"))
    );

    const { data, error } = await fetchResendEmails();

    expect(data).toEqual([]);
    expect(error).not.toBeNull();
  });

  it("ohne RESEND_API_KEY ⇒ Hinweis, kein Fetch", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { error } = await fetchResendEmails();

    expect(error).toMatch(/RESEND_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
