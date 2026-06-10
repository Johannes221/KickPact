"use client";

import { useEffect, useState } from "react";
import { isIOSApp } from "./native";

/**
 * Hydration-sicherer Hook für die iOS-App-Erkennung. Liefert auf dem Server
 * und im ersten Client-Render `false` (= Web-Pfad, matcht das SSR-Markup) und
 * erst nach dem Mount den echten Wert — so entsteht kein Hydration-Mismatch.
 * Für Stellen ohne Server-Kontext (reine Client-Komponenten wie die
 * Pricing-Matrix), wo {@link isNativeAppRequest} nicht verfügbar ist.
 */
export function useIsIOSApp(): boolean {
  const [ios, setIos] = useState(false);
  useEffect(() => {
    setIos(isIOSApp());
  }, []);
  return ios;
}
