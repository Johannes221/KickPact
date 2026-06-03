"use client";

import { useEffect, useRef } from "react";
import { ensurePushRegistrationIfGranted } from "@/lib/platform/push";

/**
 * Beim App-Start: registriert das Gerät für native iOS-Push (APNs) und schickt
 * den Device-Token an `/api/native/push-token` — ABER nur, wenn die Erlaubnis
 * bereits erteilt ist. Es wird KEIN System-Dialog beim Start ausgelöst
 * (rationale-first: den Dialog stößt der „Aktivieren"-Button in den
 * Benachrichtigungs-Einstellungen an).
 *
 * Web/SSR: kompletter No-Op (der Guard in `ensurePushRegistrationIfGranted`
 * läuft vor jedem Plugin-Import). Rendert nichts.
 */
export function PushRegistrar() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void ensurePushRegistrationIfGranted();
  }, []);

  return null;
}
