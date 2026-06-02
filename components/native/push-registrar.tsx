"use client";

import { useEffect, useRef } from "react";
import { isNativeApp } from "@/lib/platform/native";

/**
 * Registriert das Gerät beim App-Start für native iOS-Push (APNs) und schickt
 * den Device-Token an `/api/native/push-token`.
 *
 * NUR im nativen Capacitor-Kontext aktiv: Der `if (!isNativeApp()) return;`-Guard
 * läuft VOR dem dynamischen `import("@capacitor/push-notifications")`, sodass im
 * Browser/SSR der Capacitor-Chunk nie geladen und nie ausgeführt wird (web-inert).
 * Rendert nichts.
 */
export function PushRegistrar() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    if (!isNativeApp()) return; // Web/SSR: kompletter No-Op, kein Plugin-Import
    ran.current = true;

    let cleanup: (() => void) | undefined;

    void (async () => {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");

        // Permission: ggf. iOS-Dialog anstoßen.
        let receive = (await PushNotifications.checkPermissions()).receive;
        if (receive === "prompt" || receive === "prompt-with-rationale") {
          receive = (await PushNotifications.requestPermissions()).receive;
        }
        if (receive !== "granted") return;

        const onRegister = await PushNotifications.addListener("registration", (token) => {
          void postToken(token.value);
        });
        const onError = await PushNotifications.addListener("registrationError", (err) => {
          console.error("[push] registration error", err);
        });

        await PushNotifications.register();

        cleanup = () => {
          void onRegister.remove();
          void onError.remove();
        };
      } catch (err) {
        console.error("[push] registrar failed", err);
      }
    })();

    return () => cleanup?.();
  }, []);

  return null;
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
