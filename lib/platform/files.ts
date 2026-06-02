import { isNativeApp } from "./native";

/**
 * Server-generierte Dateien (PDF-Rechnungen, CSV-Exports) öffnen/teilen —
 * plattform-sicher.
 *
 * **Web** (unverändert):
 *   - `openInNewTab`: `window.open(url, "_blank")` (z.B. PDF im neuen Tab)
 *   - `triggerDownload`: programmatischer `<a download>`-Click (CSV via Content-Disposition)
 *
 * **Native iOS-App:** `window.open`/`<a download>` funktionieren im WKWebView nicht
 * (kein Popup, kein Download-Manager). Stattdessen die Datei **mit Session-Cookie**
 * laden (`fetch` läuft im WKWebView → Cookie vorhanden; ein SFSafariViewController
 * via @capacitor/browser hätte eine ANDERE Cookie-Jar → 401), in den Cache schreiben
 * und das native Share-Sheet öffnen (→ „In Dateien sichern", „In … öffnen").
 *
 * Plugins werden nur nativ dynamisch importiert → kein Capacitor im Web-Bundle.
 */

async function shareServerFile(url: string, filename: string): Promise<void> {
  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Share } = await import("@capacitor/share");

  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    throw new Error(`Datei konnte nicht geladen werden (HTTP ${res.status}).`);
  }
  const blob = await res.blob();
  const base64 = await blobToBase64(blob);
  const written = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache
  });
  await Share.share({ title: filename, url: written.uri });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** PDF/Datei in neuem Tab öffnen (Web) bzw. nativ teilen. */
export async function openInNewTab(url: string, filename: string): Promise<void> {
  if (isNativeApp()) {
    await shareServerFile(url, filename);
    return;
  }
  window.open(url, "_blank");
}

/** Datei-Download anstoßen (Web: <a download>) bzw. nativ teilen. */
export async function triggerDownload(url: string, filename: string): Promise<void> {
  if (isNativeApp()) {
    await shareServerFile(url, filename);
    return;
  }
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
