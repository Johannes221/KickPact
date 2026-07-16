import { describe, it, expect } from "vitest";
import { renderToString } from "react-dom/server";
import { UpgradeGate } from "@/components/billing/upgrade-gate";

/**
 * <UpgradeGate> ist DIE Upgrade-Aufforderung der App (Cover/Galerie/Profil/Caps).
 *
 * Der frühere Test mockte `getCheckoutChannel` — die Komponente ermittelt den
 * Kanal nicht mehr selbst: sie navigiert auf die Abo-Seite, die serverseitig
 * (isNativeAppRequest) über StoreKit vs. Stripe entscheidet. Genau das ist die
 * Anti-Steering-Garantie; deshalb prüft dieser Test das gerenderte CTA-Ziel.
 *
 * jsdom ist im Projekt nicht installiert → renderToString (löst kein useEffect
 * aus, reicht hier: die Karte ist reines Markup).
 */

const base = {
  currentPlan: "basic" as const,
  clubSlug: "fc-x",
  teamId: "t1",
  feature: "Die Galerie"
};

describe("<UpgradeGate>", () => {
  it("sagt was gesperrt ist, warum, und bietet den Pro-Push an (Web)", () => {
    const html = renderToString(
      <UpgradeGate {...base} lock="expired" nativeApp={false} />
    );
    expect(html).toContain("Die Galerie");
    expect(html).toMatch(/kostenlosen Zugang/i);
    expect(html).toMatch(/Jetzt zu Pro upgraden/);
  });

  it("verlinkt auf den Mannschafts-Abo-Pfad statt inline zu kaufen", () => {
    const html = renderToString(
      <UpgradeGate {...base} lock="expired" nativeApp={false} />
    );
    expect(html).toContain('href="/verein/fc-x/mannschaft/t1/abo"');
  });

  it("iOS-App: nativer Wortlaut, internes Ziel, KEINE Web-Preise", () => {
    const html = renderToString(
      <UpgradeGate {...base} lock="expired" nativeApp />
    );
    expect(html).toMatch(/Pro freischalten/);
    expect(html).toContain('href="/verein/fc-x/mannschaft/t1/abo"');
    // Kein Browser-Link, kein /preise, keine €-Preise (Apple 3.1.1/3.1.3).
    expect(html).not.toMatch(/href="https?:/);
    expect(html).not.toMatch(/href="\/preise/);
    expect(html).not.toMatch(/€/);
  });

  it("Sommerpause: kein Upgrade-Versprechen an einen zahlenden Verein", () => {
    const html = renderToString(
      <UpgradeGate
        {...base}
        currentPlan="pro"
        lock="paused"
        nativeApp={false}
      />
    );
    expect(html).toMatch(/Sommerpause|Juni/i);
    expect(html).not.toMatch(/upgraden/i);
  });

  it("ist für Screenreader angekündigt (kein stilles Scheitern)", () => {
    const html = renderToString(
      <UpgradeGate {...base} lock="expired" nativeApp={false} />
    );
    expect(html).toMatch(/aria-live="polite"/);
  });
});
