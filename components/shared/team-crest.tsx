"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface TeamCrestProps {
  /** Anzeigename — Quelle für die Initialen-Fallback. */
  name: string;
  /** Logo-URL. Fehlt sie ODER lädt sie nicht, werden Initialen gezeigt. */
  src?: string | null;
  /** Kantenlänge in px (Default 40). */
  size?: number;
  /** Eckenform: Kreis (Default) oder abgerundetes Quadrat (Wappen-Look). */
  shape?: "circle" | "squircle";
  className?: string;
}

/**
 * Einheitliches Vereins-/Mannschafts-Wappen: zeigt das Logo, sonst 1–2
 * Initialen auf einem brand-getönten Grund. Ersetzt die zuvor pro Seite ad-hoc
 * gebauten Logo-Badges + grauen Platzhalter-Kreise (Aufgabe 6) — ein
 * Identifikator statt langem, abgeschnittenem Text.
 *
 * Client-Component, weil der Fallback auch greifen muss, wenn die Logo-URL
 * zwar gesetzt ist, das Bild aber NICHT lädt (onError) — sonst zeigt der Browser
 * sein kaputtes-Bild-Icon statt der Initialen.
 */
export function TeamCrest({
  name,
  src,
  size = 40,
  shape = "circle",
  className
}: TeamCrestProps) {
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // SSR-Bild kann schon VOR der Hydration fertig (oder kaputt) geladen sein —
  // dann feuern onLoad/onError nie an React. Beim Mount den fertigen Zustand
  // prüfen und ggf. auf Initialen zurückfallen.
  useEffect(() => {
    setFailed(false);
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, [src]);

  const showImg = Boolean(src) && !failed;
  const radius = shape === "circle" ? "rounded-full" : "rounded-xl";
  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden bg-accent-muted text-accent-dark font-bold leading-none",
        radius,
        className
      )}
      aria-hidden
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={src as string}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
          onLoad={(e) => {
            // Manche Logo-Endpunkte liefern bei fehlendem Bild ein „erfolgreiches"
            // leeres/ungültiges Bild (load statt error). naturalWidth === 0 →
            // trotzdem auf Initialen zurückfallen.
            if (e.currentTarget.naturalWidth === 0) setFailed(true);
          }}
        />
      ) : (
        <span style={{ fontSize: Math.round(size * 0.4) }}>{initials(name)}</span>
      )}
    </span>
  );
}

/** 1–2 Initialen aus dem Namen (erste Buchstaben der ersten beiden Wörter). */
function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
