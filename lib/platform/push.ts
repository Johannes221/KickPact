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

async function loadPlugin(): Promise<PushPlugin> {
  const mod = await import("@capacitor/push-notifications");
  return mod.PushNotifications;
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
    const P = await loadPlugin();
    return normalize((await P.checkPermissions()).receive);
  } catch {
    return "unsupported";
  }
}

let listenersBound = false;

/** Registration-/Error-Listener (idempotent) + APNs-Registrierung anstoßen. */
async function registerAndForwardToken(P: PushPlugin): Promise<void> {
  if (!listenersBound) {
    listenersBound = true;
    await P.addListener("registration", (token) => {
      void postToken(token.value);
    });
    await P.addListener("registrationError", (err) => {
      console.error("[push] registration error", err);
    });
  }
  await P.register();
}

/**
 * Beim App-Start aufrufen: registriert das Gerät NUR, wenn die Push-Erlaubnis
 * bereits erteilt ist — kein System-Dialog. Hält den Device-Token frisch.
 */
export async function ensurePushRegistrationIfGranted(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const P = await loadPlugin();
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
    const P = await loadPlugin();
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
