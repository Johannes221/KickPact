import { registerPlugin } from "@capacitor/core";
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
  return IAPPlugin;
}

export async function getProducts(productIds: string[]): Promise<AppleProduct[]> {
  const { products } = await plugin().getProducts({ productIds });
  return products;
}

/** Startet das native StoreKit-Sheet; gibt das signierte JWS zurück. */
export async function purchase(productId: string): Promise<AppleTransaction> {
  return plugin().purchase({ productId });
}

export async function restore(): Promise<AppleTransaction[]> {
  const { restored } = await plugin().restore();
  return restored;
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
