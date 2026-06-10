"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { acronymTeamName } from "@/lib/utils/team-name";

// useLayoutEffect läuft auf dem Server nicht (React-Warnung) — im SSR auf
// useEffect ausweichen. Auf dem Client misst+tauscht der Layout-Effekt VOR dem
// Paint, sodass kein sichtbares „Flackern" (voller Name → Kürzel) entsteht.
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Zeigt IMMER den vollen Teamnamen — und fällt NUR dann auf das Scoreboard-
 * Kürzel ({@link acronymTeamName}, z.B. „SV Schwetzingen" → „SVS") zurück,
 * wenn der volle Name in seiner Spalte nicht auf eine Zeile passt.
 *
 * Regel (statt Zeichen-Heuristik): echte Breiten-Messung. Ein unsichtbarer
 * Mess-Span trägt den vollen Namen in derselben Schrift ohne Umbruch; ist seine
 * Eigenbreite größer als die verfügbare Spaltenbreite, wird gekürzt. Ein
 * ResizeObserver misst bei Layout-/Viewport-Änderungen neu (auch zurück zum
 * vollen Namen, wenn wieder Platz ist).
 */
export function FitTeamName({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [abbreviated, setAbbreviated] = useState(false);

  useIsoLayoutEffect(() => {
    const box = boxRef.current;
    const measurer = measureRef.current;
    if (!box || !measurer) return;

    const measure = () => {
      const available = box.clientWidth;
      const needed = measurer.scrollWidth; // voller Name, nie umgebrochen
      if (available > 0 && needed > 0) {
        // +1px Toleranz gegen Sub-Pixel-Rundung.
        setAbbreviated(needed > available + 1);
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [name]);

  return (
    <div ref={boxRef} className={className} title={name} style={{ position: "relative" }}>
      {/* Unsichtbarer Messpunkt: voller Name, gleiche Schrift, nie umgebrochen,
          aus dem Fluss genommen — beeinflusst weder Höhe noch Klick. */}
      <span
        ref={measureRef}
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          visibility: "hidden",
          whiteSpace: "nowrap",
          pointerEvents: "none",
        }}
      >
        {name}
      </span>
      {abbreviated ? acronymTeamName(name) : name}
    </div>
  );
}
