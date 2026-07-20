/**
 * fetchCrestBytes lädt ein Vereinswappen. Getestet werden die Guards, die
 * verhindern, dass etwas anderes als ein echtes Bild als „Logo" durchkommt und
 * später als kaputtes Motiv im Story-Bild landet — plus: nie werfen, Fehler → null.
 */
import { describe, it, expect, vi } from "vitest";

const fetchMock = vi.fn();

vi.mock("undici", async (importOriginal) => {
  const actual = await importOriginal<typeof import("undici")>();
  return { ...actual, fetch: (...args: unknown[]) => fetchMock(...args) };
});

const { fetchCrestBytes } = await import("@/lib/crawler/fussballde");

function res(opts: {
  ok?: boolean;
  contentType?: string;
  body?: Uint8Array;
}) {
  return {
    ok: opts.ok ?? true,
    headers: { get: (h: string) => (h === "content-type" ? opts.contentType ?? null : null) },
    arrayBuffer: async () => (opts.body ?? new Uint8Array()).buffer
  };
}

describe("fetchCrestBytes", () => {
  it("liefert Bytes + content-type bei einer echten Bild-Antwort", async () => {
    fetchMock.mockResolvedValueOnce(
      res({ contentType: "image/png", body: new Uint8Array([1, 2, 3]) })
    );
    const out = await fetchCrestBytes("https://f.de/getLogo/A");
    expect(out?.contentType).toBe("image/png");
    expect(out?.bytes.length).toBe(3);
  });

  it("verwirft eine Nicht-Bild-Antwort (z.B. Block-/HTML-Seite) → null", async () => {
    fetchMock.mockResolvedValueOnce(
      res({ contentType: "text/html", body: new Uint8Array([1, 2, 3]) })
    );
    expect(await fetchCrestBytes("https://f.de/getLogo/A")).toBeNull();
  });

  it("verwirft eine leere Bild-Antwort → null", async () => {
    fetchMock.mockResolvedValueOnce(res({ contentType: "image/png", body: new Uint8Array() }));
    expect(await fetchCrestBytes("https://f.de/getLogo/A")).toBeNull();
  });

  it("nicht-ok (404/5xx) → null", async () => {
    fetchMock.mockResolvedValueOnce(res({ ok: false, contentType: "image/png" }));
    expect(await fetchCrestBytes("https://f.de/getLogo/A")).toBeNull();
  });

  it("Netzfehler/Timeout wird geschluckt → null (Wappen ist kosmetisch)", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network"));
    expect(await fetchCrestBytes("https://f.de/getLogo/A")).toBeNull();
  });
});
