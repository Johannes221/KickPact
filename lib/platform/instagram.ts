import { Capacitor, registerPlugin } from "@capacitor/core";
import { isIOSApp } from "@/lib/platform/native";
import { fetchAsBase64 } from "@/lib/platform/files";

/**
 * Direktes Teilen in Instagram Stories (Meta „Sharing to Stories") — nur in
 * der nativen iOS-App. Umgeht Instagrams notorisch kaputte Share-Extension
 * (leerer Screen, überlappende Buttons) komplett: das Motiv landet über das
 * `instagram-stories://share`-URL-Scheme + Pasteboard direkt als Hintergrund
 * im Story-Editor. Natives Gegenstück: ios/App/App/InstagramStoriesPlugin.swift
 * (registriert in MainViewController.capacitorDidLoad — lokale Plugins stehen
 * NICHT in der von `cap sync` generierten packageClassList!).
 *
 * Meta verlangt eine Meta-App-ID als `source_application` →
 * `NEXT_PUBLIC_META_APP_ID`. Ohne die ID (oder auf Web / in einer App-Version
 * ohne Plugin) meldet `canShareToInstagramStory()` false und der Aufrufer
 * bleibt beim generischen Share-Sheet — kein Feature-Bruch, nur kein Direktweg.
 */

interface InstagramStoriesPluginShape {
  canShare(): Promise<{ available: boolean }>;
  shareToStory(opts: { imageBase64: string; appId: string }): Promise<void>;
}

// registerPlugin statt window.Capacitor.Plugins-Zugriff — auf der remote
// geladenen WebView ist Letzteres unzuverlässig (siehe lib/platform/iap.ts).
const InstagramStories = registerPlugin<InstagramStoriesPluginShape>("InstagramStories");

// Meta-App-ID (öffentlich, kein Secret) — Next.js inlined den Wert zur Build-Zeit.
const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID ?? "";

/**
 * True nur, wenn der Direktweg wirklich funktionieren kann: iOS-App, App-ID
 * konfiguriert, Plugin in dieser App-Version vorhanden UND Instagram
 * installiert. Wirft nie — jedes Problem heißt schlicht „nicht verfügbar".
 * Bewusst erst beim Tap aufrufen (nicht beim Mount cachen): billig, immer
 * frisch, und Instagram kann zwischen Mount und Tap (de)installiert werden.
 */
export async function canShareToInstagramStory(): Promise<boolean> {
  if (!META_APP_ID || !isIOSApp()) return false;
  if (!Capacitor.isPluginAvailable("InstagramStories")) return false;
  try {
    return (await InstagramStories.canShare()).available;
  } catch {
    // Versions-Skew: Web-Deploy kennt das Plugin, die installierte App nicht.
    return false;
  }
}

/**
 * Share-Bild laden (Session-Cookie nötig — die wrapped-image-Route ist
 * auth-gated) und direkt in den Instagram-Story-Editor geben.
 */
export async function shareImageToInstagramStory(url: string): Promise<void> {
  if (!isIOSApp()) {
    throw new Error("Direktes Story-Teilen gibt es nur in der iOS-App.");
  }
  const { base64, contentType } = await fetchAsBase64(url);
  if (!contentType.startsWith("image/")) {
    // Abgelaufene Session: requireUser() redirected auf /login → fetch folgt
    // und liefert 200 + HTML. Ohne diesen Guard läge die Login-Seite als
    // „Bild" im Pasteboard und Instagram öffnete mit kaputtem Hintergrund.
    throw new Error("Kein Bild erhalten — bitte neu einloggen und nochmal versuchen.");
  }
  await InstagramStories.shareToStory({ imageBase64: base64, appId: META_APP_ID });
}
