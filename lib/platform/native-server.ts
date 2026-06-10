import { headers } from "next/headers";

/**
 * Server-seitige Native-App-Erkennung über den User-Agent. Capacitor hängt
 * `KickPactApp` an den UA (capacitor.config `appendUserAgent`); aktuell ist das
 * ausschließlich die iOS-App. Gegenstück zu {@link isIOSApp} aus
 * `lib/platform/native.ts`, aber für Server Components — so kann Markup, das in
 * der iOS-App nicht erscheinen darf (Apple Anti-Steering / IAP, Guideline
 * 3.1.1 + 3.1.3), schon serverseitig weggelassen werden statt per Client-JS
 * nach der Hydration auszublenden (kein Flackern, kein Anti-Steering-Fenster).
 */
export async function isNativeAppRequest(): Promise<boolean> {
  const ua = (await headers()).get("user-agent") ?? "";
  return ua.includes("KickPactApp");
}
