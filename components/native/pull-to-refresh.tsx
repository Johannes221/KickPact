"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import { isNativeApp } from "@/lib/platform/native";

const THRESHOLD = 72; // px (nach Widerstand), ab dem das Refresh auslöst
const MAX_PULL = 110; // Klammer für die maximale Zieh-Distanz
const RESISTANCE = 0.5; // Dämpfung: 1px Finger → 0.5px Indikator

/**
 * Native iOS Pull-to-Refresh-Geste. Nur in der Capacitor-App aktiv
 * (`isNativeApp()`); im Browser rendert die Komponente nichts und hängt keine
 * Listener an — Desktop/Web-Scroll bleibt komplett unangetastet.
 *
 * Mechanik: Ein Ziehen nach unten, während die Seite ganz oben steht
 * (`scrollY <= 0`), zeigt einen fixierten Spinner-Indikator unter dem Header.
 * Über dem Schwellwert losgelassen → `onRefresh()` wird abgewartet, der
 * Indikator bleibt solange als Lade-Spinner stehen und schnappt danach zurück.
 * Der Seiteninhalt wird bewusst NICHT verschoben (robust gegen WKWebView-
 * Rubber-Banding) — der Indikator allein trägt die Geste.
 */
export function PullToRefresh({
  onRefresh,
  disabled = false
}: {
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
}) {
  const [native, setNative] = useState(false);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Refs spiegeln den State für die (nicht neu gebundenen) Touch-Closures.
  const startY = useRef<number | null>(null);
  const engaged = useRef(false);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const disabledRef = useRef(disabled);
  pullRef.current = pull;
  refreshingRef.current = refreshing;
  disabledRef.current = disabled;

  useEffect(() => {
    setNative(isNativeApp());
  }, []);

  useEffect(() => {
    if (!native) return;

    function reset() {
      startY.current = null;
      engaged.current = false;
      setPull(0);
    }

    function onStart(e: TouchEvent) {
      if (refreshingRef.current || disabledRef.current) return;
      if (window.scrollY > 0) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0]!.clientY;
      engaged.current = false;
    }

    function onMove(e: TouchEvent) {
      if (startY.current === null || refreshingRef.current || disabledRef.current) {
        return;
      }
      // Während der Geste nach oben gescrollt? → abbrechen, normalen Scroll lassen.
      if (window.scrollY > 0) {
        reset();
        return;
      }
      const dy = e.touches[0]!.clientY - startY.current;
      if (dy <= 0) {
        // Nach oben gewischt, bevor die Geste griff → Startpunkt nachführen.
        if (!engaged.current) startY.current = e.touches[0]!.clientY;
        return;
      }
      engaged.current = true;
      // Eigene Geste → native Overscroll-Bounce unterdrücken.
      e.preventDefault();
      setPull(Math.min(MAX_PULL, dy * RESISTANCE));
    }

    async function onEnd() {
      if (startY.current === null) {
        return;
      }
      const shouldRefresh =
        pullRef.current >= THRESHOLD && !refreshingRef.current && !disabledRef.current;
      startY.current = null;
      engaged.current = false;
      if (!shouldRefresh) {
        setPull(0);
        return;
      }
      setRefreshing(true);
      setPull(THRESHOLD); // Indikator als Lade-Spinner stehen lassen
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPull(0);
      }
    }

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
    // onRefresh ist beim Aufrufer stabil genug; native steuert das (De-)Mounten.
  }, [native, onRefresh]);

  if (!native) return null;

  const visible = pull > 0 || refreshing;
  const progress = Math.min(1, pull / THRESHOLD);
  // Snap-Animation nur, wenn der Finger NICHT mehr zieht (startY === null).
  const animating = startY.current === null;

  return (
    <div
      aria-hidden={!visible}
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center"
      style={{
        top: "calc(env(safe-area-inset-top) + 52px)",
        transform: `translateY(${pull}px)`,
        opacity: refreshing ? 1 : progress,
        transition: animating
          ? "transform 0.25s ease, opacity 0.2s ease"
          : "none"
      }}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-brand-neutral/40">
        {refreshing ? (
          <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />
        ) : (
          <ArrowDown
            className="h-4 w-4 text-accent"
            aria-hidden
            style={{
              transform: `rotate(${progress >= 1 ? 180 : 0}deg)`,
              transition: "transform 0.15s ease"
            }}
          />
        )}
      </div>
    </div>
  );
}
