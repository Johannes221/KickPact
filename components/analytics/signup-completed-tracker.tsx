"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics/track";

const SESSION_KEY = "kp_signup_completed_fired";

/**
 * Conversion-Tracker: feuert `signup_completed` einmal pro Browser-Session
 * beim ersten Mount nach erfolgreichem Auth-Roundtrip (Magic-Link-Klick oder
 * OAuth-Callback). Wird auf der ersten Onboarding-Page eingehängt, weil das
 * der erste authentifizierte Touchpoint nach Auth ist.
 *
 * sessionStorage-Dedupe verhindert Mehrfach-Tracking bei Step-Reloads im
 * gleichen Tab.
 */
export function SignupCompletedTracker({
  method
}: {
  /** Optional: woher der User kommt — wird als prop mitgeschickt. */
  method?: "magic_link" | "google" | "apple" | "unknown";
}) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem(SESSION_KEY) === "1") return;
      window.sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // sessionStorage nicht verfügbar (z.B. Privacy-Mode) → in dem Fall
      // tracken wir lieber doppelt als gar nicht.
    }
    track("signup_completed", { method: method ?? "unknown" });
  }, [method]);

  return null;
}
