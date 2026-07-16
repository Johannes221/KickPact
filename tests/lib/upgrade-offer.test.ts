import { describe, it, expect } from "vitest";
import {
  lockFromGate,
  upsellTargetPlan,
  aboPathFor,
  resolveUpgradeOffer,
  type LockKind
} from "@/lib/billing/upgrade-offer";
import { PLAN_ORDER, type PlanKey } from "@/lib/stripe/pricing";

/**
 * Upgrade-Aufforderung statt kryptischer Mini-Fehlermeldung (Johannes-Feedback
 * 2026-07-16): „Das geht im kostenlosen nicht — jetzt zu Pro upgraden."
 *
 * Zwei Dinge werden hier festgenagelt:
 *  1. WELCHER Plan darf was / worauf zeigt der Push (nie ein Downgrade, nie ein
 *     Upsell an jemanden, der bereits zahlt).
 *  2. WOHIN führt der CTA im App- vs. Web-Kontext — der Apple-Anti-Steering-
 *     Test (Guideline 3.1.1/3.1.3). Fliegt der, fliegt die App aus dem Store.
 */

describe("lockFromGate", () => {
  it("nicht read-only → keine Sperre", () => {
    expect(
      lockFromGate({ status: "active", isReadOnly: false, reason: null })
    ).toBeNull();
    // Abgelaufener Trial VOR dem Cron: isReadOnly=false → UI bleibt offen.
    expect(
      lockFromGate({
        status: "trialing",
        isReadOnly: false,
        reason: "trial_expired"
      })
    ).toBeNull();
  });

  it("gekündigt / nie bezahlter Trial → expired (Upsell-Fall)", () => {
    expect(
      lockFromGate({ status: "cancelled", isReadOnly: true, reason: null })
    ).toBe("expired");
    expect(
      lockFromGate({
        status: "cancelled",
        isReadOnly: true,
        reason: "trial_expired"
      })
    ).toBe("expired");
    expect(
      lockFromGate({ status: "incomplete", isReadOnly: true, reason: null })
    ).toBe("expired");
  });

  it("past_due und paused sind eigene Gründe — KEIN Upsell", () => {
    expect(
      lockFromGate({ status: "past_due", isReadOnly: true, reason: null })
    ).toBe("past_due");
    expect(
      lockFromGate({ status: "paused", isReadOnly: true, reason: null })
    ).toBe("paused");
  });
});

describe("upsellTargetPlan — nie ein Downgrade", () => {
  it("Basic → Pro (Johannes' Push in Pro)", () => {
    expect(upsellTargetPlan("basic")).toBe("pro");
  });

  it("Pro → Pro (Reaktivierung, kein Zwangs-Upsell auf Verein)", () => {
    expect(upsellTargetPlan("pro")).toBe("pro");
  });

  it("Vereinslizenz → Verein (Pro wäre ein Rückschritt)", () => {
    expect(upsellTargetPlan("verein")).toBe("verein");
  });
});

describe("aboPathFor — der richtige Abo-Pfad", () => {
  it("basic/pro pflegen ihr Abo im Mannschafts-Kontext", () => {
    expect(aboPathFor({ clubSlug: "fc-x", teamId: "t1", plan: "basic" })).toBe(
      "/verein/fc-x/mannschaft/t1/abo"
    );
    expect(aboPathFor({ clubSlug: "fc-x", teamId: "t1", plan: "pro" })).toBe(
      "/verein/fc-x/mannschaft/t1/abo"
    );
  });

  it("Vereinslizenz geht aufs Vereins-Abo", () => {
    expect(aboPathFor({ clubSlug: "fc-x", teamId: "t1", plan: "verein" })).toBe(
      "/verein/fc-x/abo"
    );
  });

  it("ohne teamId bleibt nur das Vereins-Abo", () => {
    expect(aboPathFor({ clubSlug: "fc-x", teamId: null, plan: "pro" })).toBe(
      "/verein/fc-x/abo"
    );
  });
});

const base = {
  clubSlug: "fc-x",
  teamId: "t1",
  feature: "Die Galerie"
} as const;

describe("resolveUpgradeOffer — Web (Stripe-Kontext)", () => {
  it("kostenloser/abgelaufener Zugang auf Basic → Push in Pro, Ziel = Mannschafts-Abo", () => {
    const offer = resolveUpgradeOffer({
      ...base,
      lock: "expired",
      currentPlan: "basic",
      nativeApp: false
    });
    expect(offer.targetPlan).toBe("pro");
    expect(offer.ctaLabel).toBe("Jetzt zu Pro upgraden");
    expect(offer.ctaHref).toBe("/verein/fc-x/mannschaft/t1/abo");
    expect(offer.title).toContain("Die Galerie");
    expect(offer.highlights.length).toBeGreaterThan(0);
  });

  it("Cap auf Basic → Upsell mit Tarif-Begründung", () => {
    const offer = resolveUpgradeOffer({
      ...base,
      lock: "cap",
      currentPlan: "basic",
      nativeApp: false,
      feature: "Weitere Sponsoren"
    });
    expect(offer.targetPlan).toBe("pro");
    expect(offer.title).toMatch(/Basic-Tarif/);
  });

  it("gekündigtes Pro → Reaktivieren statt „upgraden“", () => {
    const offer = resolveUpgradeOffer({
      ...base,
      lock: "expired",
      currentPlan: "pro",
      nativeApp: false
    });
    expect(offer.targetPlan).toBe("pro");
    expect(offer.ctaLabel).toBe("Pro reaktivieren");
  });

  it("Vereinslizenz → Vereins-Abo, kein Pro-Downgrade-Pitch", () => {
    const offer = resolveUpgradeOffer({
      ...base,
      lock: "expired",
      currentPlan: "verein",
      nativeApp: false
    });
    expect(offer.targetPlan).toBe("verein");
    expect(offer.ctaHref).toBe("/verein/fc-x/abo");
    expect(offer.ctaLabel).not.toMatch(/Pro/);
  });
});

describe("resolveUpgradeOffer — kein Upsell, wo der Kunde schon zahlt", () => {
  it("past_due: Zahlung klären statt upgraden", () => {
    const offer = resolveUpgradeOffer({
      ...base,
      lock: "past_due",
      currentPlan: "pro",
      nativeApp: false
    });
    expect(offer.targetPlan).toBeNull();
    expect(offer.highlights).toEqual([]);
    expect(offer.ctaLabel).not.toMatch(/upgrad|freischalt/i);
  });

  it("paused (Saison-Pass-Sommerpause): Info, kein Upgrade-Versprechen", () => {
    const offer = resolveUpgradeOffer({
      ...base,
      lock: "paused",
      currentPlan: "pro",
      nativeApp: false
    });
    expect(offer.targetPlan).toBeNull();
    expect(offer.body).toMatch(/Sommerpause|Juni|Juli|August/i);
    expect(offer.ctaLabel).not.toMatch(/upgrad|freischalt/i);
  });
});

describe("resolveUpgradeOffer — Apple Anti-Steering (3.1.1 / 3.1.3)", () => {
  const ALL_LOCKS: LockKind[] = ["expired", "past_due", "paused", "cap"];

  it("iOS-App: CTA zeigt IMMER auf eine interne Abo-Route — nie Browser, nie /preise", () => {
    for (const lock of ALL_LOCKS) {
      for (const currentPlan of PLAN_ORDER) {
        const offer = resolveUpgradeOffer({
          ...base,
          lock,
          currentPlan,
          nativeApp: true
        });
        // Interner Pfad: die Abo-Seite entscheidet serverseitig StoreKit vs.
        // Stripe. Alles andere (externe URL, Web-Preise) wäre Anti-Steering.
        expect(offer.ctaHref).toMatch(/^\/verein\/[^/]+\/(mannschaft\/[^/]+\/)?abo$/);
        expect(offer.ctaHref).not.toMatch(/^https?:|^\/\/|preise/i);
      }
    }
  });

  it("iOS-App zeigt keine Web-Preise im Angebots-Text", () => {
    for (const lock of ALL_LOCKS) {
      for (const currentPlan of PLAN_ORDER) {
        const offer = resolveUpgradeOffer({
          ...base,
          lock,
          currentPlan,
          nativeApp: true
        });
        const text = [offer.title, offer.body, offer.ctaLabel, ...offer.highlights].join(" ");
        // Preise kommen in der App ausschließlich aus StoreKit (displayPrice).
        expect(text).not.toMatch(/€|EUR|\d+,\d{2}/);
      }
    }
  });

  it("nativeApp steuert NUR das Wording, nie das Ziel", () => {
    const args = { ...base, lock: "expired" as const, currentPlan: "basic" as PlanKey };
    const web = resolveUpgradeOffer({ ...args, nativeApp: false });
    const app = resolveUpgradeOffer({ ...args, nativeApp: true });
    // Gleiches Ziel — so hängt Anti-Steering NICHT an der Plattform-Erkennung.
    expect(app.ctaHref).toBe(web.ctaHref);
    // In der App die native Sprache („freischalten"), kein „upgraden".
    expect(app.ctaLabel).toBe("Pro freischalten");
  });
});
