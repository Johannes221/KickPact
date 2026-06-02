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

/** True, wenn die App in der nativen Capacitor-Hülle (iOS/Android) läuft. */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  return window.Capacitor?.isNativePlatform?.() ?? false;
}

/** Aktuelle Plattform — `"web"` auf Browser/SSR. */
export function getPlatform(): "ios" | "android" | "web" {
  if (typeof window === "undefined") return "web";
  const platform = window.Capacitor?.getPlatform?.();
  return platform === "ios" || platform === "android" ? platform : "web";
}

/** True nur in der nativen iOS-App — der relevante Schalter für IAP/Anti-Steering. */
export function isIOSApp(): boolean {
  return getPlatform() === "ios";
}
