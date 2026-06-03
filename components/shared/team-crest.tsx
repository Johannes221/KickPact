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

  // SSR-Bild kann schon VOR der Hydration fertig (oder kaputt) sein — dann
  // feuern React-onLoad/onError nie. Beim Mount den fertigen Zustand prüfen;
  // ist das Bild noch am Laden, native Listener anhängen (fangen auch den Fall,
  // dass die Logo-URL erst nach der Hydration fehlschlägt, z.B. Redirect-Ziel).
  useEffect(() => {
    setFailed(false);
    const img = imgRef.current;
    if (!img) return;
    const markIfBroken = () => {
      if (img.naturalWidth === 0) setFailed(true);
    };
    if (img.complete) {
      markIfBroken();
      return;
    }
    const onError = () => setFailed(true);
    img.addEventListener("load", markIfBroken);
    img.addEventListener("error", onError);
    return () => {
      img.removeEventListener("load", markIfBroken);
      img.removeEventListener("error", onError);
    };
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
        // Einheitliches Platzhalter-Wappen (KickPact-Icon), wenn kein Logo
        // hochgeladen wurde — ersetzt die früheren Initialen.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src="/brand/team-crest-fallback.png"
          alt={name}
          className="h-full w-full object-cover"
        />
      )}
    </span>
  );
}
