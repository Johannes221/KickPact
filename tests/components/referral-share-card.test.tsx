/**
 * Hydration-Sicherheit der ReferralShareCard (Safari-#418-Bug 2026-06-12).
 *
 * Der „Teilen"-Button darf NICHT davon abhängen, ob `navigator.share` zur
 * Render-Zeit existiert: Auf dem Server ist `navigator` undefined, in
 * Safari/iOS existiert `navigator.share` → der erste Client-Render wich vom
 * Server-HTML ab und React warf auf /sponsor einen Hydration-Error (#418).
 *
 * Invariante: Das Render-Ergebnis ist eine reine Funktion von Props+State —
 * der erste Render muss MIT und OHNE `navigator.share` identisch ausfallen.
 * (Der Button darf danach gern per Effect nachgerüstet werden.)
 */
import { describe, it, expect, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import { ReferralShareCard } from "@/components/sponsor/referral-share-card";

const SHARE_URL = "https://kickpact.com/r/abc123";

const originalNavigator = Object.getOwnPropertyDescriptor(
  globalThis,
  "navigator"
);

function setNavigatorShare(present: boolean) {
  Object.defineProperty(globalThis, "navigator", {
    value: present ? { share: () => Promise.resolve() } : undefined,
    configurable: true,
    writable: true
  });
}

afterEach(() => {
  if (originalNavigator) {
    Object.defineProperty(globalThis, "navigator", originalNavigator);
  } else {
    delete (globalThis as { navigator?: unknown }).navigator;
  }
});

describe("ReferralShareCard — Hydration-Invariante", () => {
  it("erster Render ist identisch mit und ohne navigator.share", () => {
    setNavigatorShare(false);
    const serverHtml = renderToString(
      <ReferralShareCard shareUrl={SHARE_URL} />
    );

    setNavigatorShare(true);
    const safariFirstClientRender = renderToString(
      <ReferralShareCard shareUrl={SHARE_URL} />
    );

    expect(safariFirstClientRender).toBe(serverHtml);
  });
});
