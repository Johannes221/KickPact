import { isNativeApp } from "./native";

/**
 * Native-Push-Helfer (iOS/APNs via Capacitor). Web/SSR-sicher: alle Funktionen
 * sind ein No-Op außerhalb der Capacitor-App und importieren das Plugin erst
 * NACH dem `isNativeApp()`-Guard (kein Capacitor-Chunk im Browser).
 *
 * Rationale-first: Wir feuern den iOS-System-Dialog NIE beim App-Start. Beim
 * Start registrieren wir nur still, wenn die Erlaubnis bereits erteilt ist
 * (`ensurePushRegistrationIfGranted`). Den Dialog löst ausschließlich eine
 * bewusste Nutzeraktion über `enablePushNotifications()` aus (Button in den
 * Benachrichtigungs-Einstellungen) — nach einem erklärenden Pre-Prompt.
 */
export type PushPermission = "granted" | "denied" | "prompt" | "unsupported";

type PushPlugin = typeof import("@capacitor/push-notifications").PushNotifications;

/**
 * Lädt das Capacitor-Push-MODUL (erst nach dem isNativeApp()-Guard, kein
 * Capacitor-Chunk im Browser). Gibt bewusst das Modul-Namespace-Objekt zurück
 * und NICHT die PushNotifications-Instanz: Capacitor-Plugins sind Proxys, die
 * JEDEN Property-Zugriff als Methode behandeln — auch `.then`. Würde man die
 * Instanz aus einer async-Funktion zurückgeben, behandelt die Promise-Auflösung
 * sie als Thenable und ruft `PushNotifications.then(...)` auf →
 * "PushNotifications.then() is not implemented on ios" (Sentry JS-NEXTJS-B).
 * Über das Modul greifen die Aufrufer .PushNotifications SYNCHRON ab.
 */
function loadPushModule(): Promise<typeof import("@capacitor/push-notifications")> {
  return import("@capacitor/push-notifications");
}

function normalize(receive: string): PushPermission {
  if (receive === "granted") return "granted";
  if (receive === "denied") return "denied";
  return "prompt"; // "prompt" | "prompt-with-rationale"
}

/** Aktueller Permission-Status, ohne irgendeinen Dialog auszulösen. */
export async function getPushPermission(): Promise<PushPermission> {
  if (!isNativeApp()) return "unsupported";
  try {
    const P = (await loadPushModule()).PushNotifications;
    return normalize((await P.checkPermissions()).receive);
  } catch {
    return "unsupported";
  }
}

let listenersBound = false;
/**
 * Zuletzt registrierter APNs-Token. Wird beim Logout gebraucht, um genau DIESES
 * Gerät serverseitig abzumelden (`deregisterPushToken`) — sonst liefen die
 * privaten Push des ausgeloggten Nutzers auf einem geteilten Gerät (Familien-
 * iPad) weiter (DSGVO-Leak).
 */
let lastToken: string | null = null;

/** Registration-/Error-/Tap-Listener (idempotent) + APNs-Registrierung anstoßen. */
async function registerAndForwardToken(P: PushPlugin): Promise<void> {
  if (!listenersBound) {
    listenersBound = true;
    await P.addListener("registration", (token) => {
      lastToken = token.value;
      void postToken(token.value);
    });
    await P.addListener("registrationError", (err) => {
      console.error("[push] registration error", err);
    });
    // Deep-Link beim Antippen einer Notification: der Server legt das Ziel als
    // `data.link` in die APNs-Payload (lib/notifications/deliver.ts). Ohne
    // diesen Handler landet der Nutzer beim Kaltstart auf `/` statt beim Tor/
    // der Rechnung — der Retention-Sinn von Push verpufft. Da die App die
    // Web-App remote lädt, reicht clientseitiges `location.assign`.
    await P.addListener("pushNotificationActionPerformed", (action) => {
      const link = action.notification?.data?.link;
      if (typeof link === "string" && link.startsWith("/")) {
        window.location.assign(link);
      }
    });
  }
  await P.register();
}

/**
 * Meldet DIESES Gerät serverseitig ab (Logout / Push-Opt-out). Muss VOR dem
 * `signOut()` laufen, solange die Session-Cookie noch trägt (die DELETE-Route
 * ist session-gated). No-Op außerhalb der App oder ohne bekannten Token.
 */
export async function deregisterPushToken(): Promise<void> {
  if (!isNativeApp() || !lastToken) return;
  try {
    await fetch("/api/native/push-token", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: lastToken }),
      credentials: "include"
    });
    lastToken = null;
  } catch (err) {
    console.error("[push] deregister failed", err);
  }
}

/**
 * Beim App-Start aufrufen: registriert das Gerät NUR, wenn die Push-Erlaubnis
 * bereits erteilt ist — kein System-Dialog. Hält den Device-Token frisch.
 */
export async function ensurePushRegistrationIfGranted(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const P = (await loadPushModule()).PushNotifications;
    if (normalize((await P.checkPermissions()).receive) !== "granted") return;
    await registerAndForwardToken(P);
  } catch (err) {
    console.error("[push] silent registration failed", err);
  }
}

/**
 * Bewusste Nutzeraktion: fordert die Erlaubnis an (iOS-System-Dialog) und
 * registriert bei Erfolg. Gibt den resultierenden Status zurück, damit die UI
 * „aktiviert/abgelehnt/in iOS-Einstellungen freischalten" zeigen kann.
 */
export async function enablePushNotifications(): Promise<PushPermission> {
  if (!isNativeApp()) return "unsupported";
  try {
    const P = (await loadPushModule()).PushNotifications;
    let receive = (await P.checkPermissions()).receive;
    if (receive === "prompt" || receive === "prompt-with-rationale") {
      receive = (await P.requestPermissions()).receive;
    }
    const status = normalize(receive);
    if (status === "granted") await registerAndForwardToken(P);
    return status;
  } catch (err) {
    console.error("[push] enable failed", err);
    return "unsupported";
  }
}

async function postToken(token: string): Promise<void> {
  try {
    await fetch("/api/native/push-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, platform: "ios" }),
      credentials: "include"
    });
  } catch (err) {
    console.error("[push] token post failed", err);
  }
}
