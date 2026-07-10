import { Capacitor, registerPlugin } from "@capacitor/core";
import { isIOSApp } from "@/lib/platform/native";

/**
 * Part B — TS-Bridge zum nativen Capacitor-IAP-Plugin (IAPPlugin.swift).
 * Web-inert: auf Web/SSR wirft jede Methode einen klaren Fehler (der Aufrufer
 * ist im iOS-Kontext über getCheckoutChannel() abgesichert).
 */

/**
 * Form des nativen Plugins. Wird von `lib/platform/native.ts` als Typ der
 * `window.Capacitor.Plugins.IAPPlugin`-Eigenschaft referenziert — dadurch ist
 * der Zugriff ohne `as`-Cast typsicher.
 */
export interface IAPPluginShape {
  getProducts(opts: { productIds: string[] }): Promise<{ products: AppleProduct[] }>;
  purchase(opts: { productId: string }): Promise<AppleTransaction>;
  restore(): Promise<{ restored: AppleTransaction[] }>;
}

export interface AppleProduct {
  productId: string;
  displayName: string;
  displayPrice: string;
}
export interface AppleTransaction {
  originalTransactionId: string;
  jwsRepresentation: string;
}

// registerPlugin erzeugt den Bridge-Proxy DETERMINISTISCH und routet zum nativen
// CAP_PLUGIN("IAPPlugin") (IAPPlugin.m) — unabhängig davon, ob
// window.Capacitor.Plugins den Eintrag (schon) trägt. Der direkte
// window.Capacitor.Plugins.IAPPlugin-Zugriff war auf der remote-server.url-WebView
// unzuverlässig (undefined) → irreführende „nur in der iOS-App"-Meldung trotz App.
const IAPPlugin = registerPlugin<IAPPluginShape>("IAPPlugin");

function plugin(): IAPPluginShape {
  if (!isIOSApp()) {
    throw new Error("In-App-Käufe sind nur in der iOS-App verfügbar.");
  }
  // Versions-Skew (Remote-WebView): die Web-App wird bei jedem Deploy neu
  // geladen, die installierte native App bleibt eingefroren. Fehlt das IAPPlugin
  // in dieser App-Version, wirft die Bridge sonst einen rohen „not implemented"-
  // Fehler mitten im Kauf. Früh + klar abfangen → App-Update statt Kryptik.
  if (!Capacitor.isPluginAvailable("IAPPlugin")) {
    throw new Error(
      "Diese App-Version unterstützt In-App-Käufe noch nicht — bitte aktualisiere die KickPact-App im App Store."
    );
  }
  return IAPPlugin;
}

/**
 * Übersetzt rohe „not implemented on ios"-Bridge-Fehler (eine später ergänzte
 * Plugin-Methode, die in der installierten App-Version fehlt) in eine klare
 * App-Update-Aufforderung. Wirft immer.
 */
function throwAsAppUpdate(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (/not implemented|unimplemented|not available/i.test(msg)) {
    throw new Error(
      "Diese Aktion braucht eine neuere App-Version — bitte aktualisiere die KickPact-App im App Store."
    );
  }
  throw err instanceof Error ? err : new Error(msg);
}

export async function getProducts(productIds: string[]): Promise<AppleProduct[]> {
  try {
    const { products } = await plugin().getProducts({ productIds });
    return products;
  } catch (e) {
    throwAsAppUpdate(e);
  }
}

/** Startet das native StoreKit-Sheet; gibt das signierte JWS zurück. */
export async function purchase(productId: string): Promise<AppleTransaction> {
  try {
    return await plugin().purchase({ productId });
  } catch (e) {
    throwAsAppUpdate(e);
  }
}

export async function restore(): Promise<AppleTransaction[]> {
  try {
    const { restored } = await plugin().restore();
    return restored;
  } catch (e) {
    throwAsAppUpdate(e);
  }
}

/** Kauf + sofortige Server-Verifikation in einem Schritt. */
export async function purchaseAndVerify(
  productId: string,
  clubSlug: string
): Promise<void> {
  const tx = await purchase(productId);
  const res = await fetch("/api/apple/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clubSlug, signedTransaction: tx.jwsRepresentation }),
  });
  if (!res.ok) {
    const body: { message?: string } = await res.json().catch(() => ({}));
    throw new Error(body.message ?? "Kauf konnte nicht verifiziert werden.");
  }
}

/** Native restore() + Server-Verifikation aller wiederhergestellten Transaktionen. */
export async function restoreAndVerify(clubSlug: string): Promise<void> {
  const transactions = await restore();
  const res = await fetch("/api/apple/restore", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      clubSlug,
      transactions: transactions.map((t) => ({
        jwsRepresentation: t.jwsRepresentation
      }))
    })
  });
  if (!res.ok) {
    const body: { message?: string } = await res.json().catch(() => ({}));
    throw new Error(body.message ?? "Wiederherstellung fehlgeschlagen.");
  }
}
