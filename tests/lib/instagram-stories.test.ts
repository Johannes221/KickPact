import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.doUnmock("@capacitor/core");
  vi.resetModules();
});

/** Frisch importieren mit gestubbtem UA + App-ID. */
async function loadInstagram(ua: string, appId: string) {
  vi.stubGlobal("window", { navigator: { userAgent: ua } });
  vi.stubEnv("NEXT_PUBLIC_META_APP_ID", appId);
  vi.resetModules();
  return import("@/lib/platform/instagram");
}

/**
 * Native Bridge mocken (Happy Path): @capacitor/core liefert unser Fake-Plugin
 * und meldet es als verfügbar. Minimaler FileReader-Stub, weil blobToBase64
 * im Node-Test-Env keinen echten FileReader hat.
 */
function mockNativeBridge() {
  const plugin = {
    canShare: vi.fn(async () => ({ available: true })),
    shareToStory: vi.fn(async () => undefined)
  };
  vi.doMock("@capacitor/core", () => ({
    Capacitor: { isPluginAvailable: () => true },
    registerPlugin: () => plugin
  }));
  class FakeFileReader {
    onloadend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    result: string | null = null;
    readAsDataURL(_blob: Blob) {
      this.result = "data:image/png;base64,UE5HREFURU4=";
      queueMicrotask(() => this.onloadend?.());
    }
  }
  vi.stubGlobal("FileReader", FakeFileReader);
  return plugin;
}

function stubFetch(contentType: string, ok = true, status = 200) {
  const res = {
    ok,
    status,
    headers: new Headers({ "content-type": contentType }),
    blob: async () => new Blob([new Uint8Array([1, 2, 3])], { type: contentType })
  };
  vi.stubGlobal("fetch", vi.fn(async () => res));
}

describe("instagram-stories bridge (web-inert)", () => {
  it("canShareToInstagramStory ist auf Web false", async () => {
    const { canShareToInstagramStory } = await loadInstagram("Safari", "1234567890");
    await expect(canShareToInstagramStory()).resolves.toBe(false);
  });

  it("canShareToInstagramStory ist ohne META_APP_ID false — auch in der App", async () => {
    const { canShareToInstagramStory } = await loadInstagram("Mozilla KickPactApp", "");
    await expect(canShareToInstagramStory()).resolves.toBe(false);
  });

  it("canShareToInstagramStory schluckt Bridge-Fehler und liefert false", async () => {
    // App-UA + App-ID, isPluginAvailable true, aber canShare() wirft (Versions-
    // Skew: installierte App ohne Plugin) → false statt Throw.
    const plugin = mockNativeBridge();
    plugin.canShare.mockRejectedValueOnce(new Error("not implemented"));
    const { canShareToInstagramStory } = await loadInstagram(
      "Mozilla KickPactApp",
      "1234567890"
    );
    await expect(canShareToInstagramStory()).resolves.toBe(false);
  });

  it("shareImageToInstagramStory wirft auf Web einen klaren Fehler", async () => {
    const { shareImageToInstagramStory } = await loadInstagram("Safari", "1234567890");
    await expect(shareImageToInstagramStory("/api/x")).rejects.toThrow(/App/i);
  });
});

describe("instagram-stories bridge (nativ, gemockte Bridge)", () => {
  it("Happy Path: Bild wird als base64 mit App-ID ans Plugin übergeben", async () => {
    const plugin = mockNativeBridge();
    stubFetch("image/png");
    const { canShareToInstagramStory, shareImageToInstagramStory } = await loadInstagram(
      "Mozilla KickPactApp",
      "1234567890"
    );
    await expect(canShareToInstagramStory()).resolves.toBe(true);
    await shareImageToInstagramStory("/api/teams/t1/wrapped-image/zusammenfassung");
    expect(plugin.shareToStory).toHaveBeenCalledWith({
      imageBase64: "UE5HREFURU4=",
      appId: "1234567890"
    });
  });

  it("Nicht-Bild-Antwort (Session-Redirect → Login-HTML) wirft statt HTML zu teilen", async () => {
    const plugin = mockNativeBridge();
    stubFetch("text/html");
    const { shareImageToInstagramStory } = await loadInstagram(
      "Mozilla KickPactApp",
      "1234567890"
    );
    await expect(
      shareImageToInstagramStory("/api/teams/t1/wrapped-image/zusammenfassung")
    ).rejects.toThrow(/Bild/i);
    expect(plugin.shareToStory).not.toHaveBeenCalled();
  });

  it("HTTP-Fehler wirft mit Status", async () => {
    const plugin = mockNativeBridge();
    stubFetch("text/plain", false, 403);
    const { shareImageToInstagramStory } = await loadInstagram(
      "Mozilla KickPactApp",
      "1234567890"
    );
    await expect(
      shareImageToInstagramStory("/api/teams/t1/wrapped-image/zusammenfassung")
    ).rejects.toThrow(/403/);
    expect(plugin.shareToStory).not.toHaveBeenCalled();
  });
});
