import { isNativeApp } from "./native";

/**
 * Text in die Zwischenablage kopieren — plattform-sicher.
 *
 * Web: `navigator.clipboard` (wie bisher).
 * Native iOS-App: `@capacitor/clipboard` — im WKWebView ist `navigator.clipboard`
 * unzuverlässig (Permission-/Secure-Context-Eigenheiten), daher der native Plugin-Pfad.
 *
 * Das Plugin wird nur im Native-Kontext dynamisch importiert → keine Capacitor-
 * Dependency im Web-Bundle.
 */
export async function copyText(text: string): Promise<void> {
  if (isNativeApp()) {
    const { Clipboard } = await import("@capacitor/clipboard");
    await Clipboard.write({ string: text });
    return;
  }
  await navigator.clipboard.writeText(text);
}
