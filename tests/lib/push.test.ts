import { describe, it, expect, vi, beforeEach } from "vitest";

// Wir tun so, als liefe der Code in der nativen Capacitor-App.
vi.mock("@/lib/platform/native", () => ({ isNativeApp: () => true }));

// Capacitor-Plugins sind Proxys, die JEDEN Property-Zugriff als Methode
// behandeln — auch `.then`. Dieser Mock bildet das nach: bekannte Methoden
// liefern echte Werte, ALLE anderen Properties (insb. `then`) liefern eine
// Funktion, die beim Aufruf „not implemented on ios" wirft. Würde der Code die
// Plugin-Instanz aus einer async-Funktion zurückgeben, riefe die Promise-
// Auflösung `PushNotifications.then(...)` auf → genau dieser Fehler.
const checkPermissions = vi.fn(async () => ({ receive: "denied" }));
const PushNotifications = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (prop === "checkPermissions") return checkPermissions;
      if (prop === "requestPermissions") return async () => ({ receive: "granted" });
      if (prop === "register") return async () => undefined;
      if (prop === "addListener") return async () => ({ remove: () => {} });
      return (..._args: unknown[]) => {
        throw new Error(`PushNotifications.${prop}() is not implemented on ios`);
      };
    }
  }
);
vi.mock("@capacitor/push-notifications", () => ({ PushNotifications }));

import {
  getPushPermission,
  ensurePushRegistrationIfGranted
} from "@/lib/platform/push";

describe("push.ts — Capacitor-Proxy nicht als Thenable awaiten (Sentry JS-NEXTJS-B)", () => {
  beforeEach(() => checkPermissions.mockClear());

  it("getPushPermission löst die echte Permission auf, statt an Proxy.then zu scheitern", async () => {
    // Mit dem Bug (Plugin-Instanz aus async zurückgegeben) würde Proxy.then()
    // werfen → catch → "unsupported". Korrekt: das Modul wird aufgelöst, die
    // Instanz synchron abgegriffen → checkPermissions liefert "denied".
    await expect(getPushPermission()).resolves.toBe("denied");
    expect(checkPermissions).toHaveBeenCalledOnce();
  });

  it("ensurePushRegistrationIfGranted wirft nicht (Proxy.then wird nie berührt)", async () => {
    await expect(ensurePushRegistrationIfGranted()).resolves.toBeUndefined();
  });
});
