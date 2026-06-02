/**
 * Plattform-Detection für den späteren Capacitor-iOS-Wrapper.
 *
 * Web-sicher: KEINE Hard-Dependency auf `@capacitor/core`. Der native Kontext
 * wird über das von Capacitor zur Laufzeit injizierte `window.Capacitor`-Objekt
 * erkannt. Auf Web und bei SSR liefern alle Funktionen den Web-Default — der
 * bestehende Web-Pfad bleibt damit unverändert (Groundwork, web-inert).
 *
 * Verwendung NUR in Client-Komponenten (`"use client"`): die Erkennung braucht
 * `window`. Server-gerendertes Markup geht immer vom Web-Pfad aus; native
 * Abweichungen erst nach Hydration anwenden (sonst Hydration-Mismatch).
 *
 * Geplante Konsumenten (sobald der Wrapper existiert):
 *  - Abo-/Preise-UI im iOS-Kontext ausblenden (Apple-Anti-Steering, IAP statt Stripe)
 *  - PDF-Öffnen / CSV-Download / Clipboard via Capacitor-Plugin statt Web-API
 */

declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
  }
}

/**
 * Capacitor hängt `KickPactApp` an den User-Agent (capacitor.config
 * `appendUserAgent`). Auf **remote** geladenen Seiten (server.url) ist
 * `window.Capacitor` nicht immer zuverlässig gesetzt — der UA aber schon
 * (die Middleware nutzt ihn ja für den `/willkommen`-Redirect). Daher als
 * robuster Fallback für die Native-Erkennung.
 */
function hasNativeUserAgent(): boolean {
  return /KickPactApp/i.test(window.navigator?.userAgent ?? "");
}

/** True, wenn die App in der nativen Capacitor-Hülle (iOS/Android) läuft. */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  if (window.Capacitor?.isNativePlatform?.() === true) return true;
  return hasNativeUserAgent();
}

/** Aktuelle Plattform — `"web"` auf Browser/SSR. */
export function getPlatform(): "ios" | "android" | "web" {
  if (typeof window === "undefined") return "web";
  const platform = window.Capacitor?.getPlatform?.();
  if (platform === "ios" || platform === "android") return platform;
  // Fallback über UA: KickPactApp ist aktuell ausschließlich die iOS-App.
  return hasNativeUserAgent() ? "ios" : "web";
}

/** True nur in der nativen iOS-App — der relevante Schalter für IAP/Anti-Steering. */
export function isIOSApp(): boolean {
  return getPlatform() === "ios";
}
