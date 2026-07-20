import React, { useId } from "react";
import { interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { GREEN, NAVY, WHITE } from "./theme";

/**
 * Die animierten Grafik-Elemente — DAS, worum es hier geht: echte Objekte, die
 * sich bewegen (Ball, Konfetti, Equalizer), nicht wandernde Schrift. Alle
 * deterministisch: kein Math.random (das flackert über Remotions Frame-Cache),
 * sondern `random(seed)` mit festem Seed pro Partikel.
 */

/* ------------------------------- Fußball ---------------------------------- */

/**
 * Ein klassischer Fußball als Vektor: weiße Kugel, Navy-Muster (Kontrast, wie
 * ein echter Ball) — kein grünes Muster, das auf Weiß nur ~2,3:1 hätte. Dreht
 * und rollt über die `rotation`/Position, die der Aufrufer setzt.
 */
/** Punkte eines regelmäßigen Fünfecks als SVG-`points`-String. */
const pentagon = (cx: number, cy: number, r: number, rotDeg = 0): string =>
  Array.from({ length: 5 }, (_, i) => {
    const a = ((-90 + rotDeg + i * 72) * Math.PI) / 180;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");

export const SoccerBall: React.FC<{ size: number; rotation?: number }> = ({ size, rotation = 0 }) => {
  // Eindeutige Gradient-IDs pro Instanz, sonst greifen mehrere Bälle auf denselben
  // Verlauf zu (url(#id) trifft den ersten im Dokument).
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const sphere = `sph${uid}`;
  const shade = `shd${uid}`;

  // Zentrales Fünfeck + fünf am Rand, regelmäßig gerechnet, mit Nähten dazwischen.
  const edge = Array.from({ length: 5 }, (_, i) => {
    const a = ((-90 + i * 72) * Math.PI) / 180;
    return {
      vx: 50 + 18 * Math.cos(a),
      vy: 50 + 18 * Math.sin(a),
      cx: 50 + 35 * Math.cos(a),
      cy: 50 + 35 * Math.sin(a),
      rot: -90 + i * 72 + 180
    };
  });

  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <defs>
        {/* Kugel-Verlauf: Licht oben-links → real wirkendes Volumen. */}
        <radialGradient id={sphere} cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="62%" stopColor="#eef1ef" />
          <stop offset="100%" stopColor="#ccd5d1" />
        </radialGradient>
        {/* Schatten unten-rechts, als eigene Schicht ÜBER dem Muster — bleibt
            fix, während das Muster rotiert (Licht dreht nicht mit). */}
        <radialGradient id={shade} cx="66%" cy="72%" r="80%">
          <stop offset="52%" stopColor={NAVY} stopOpacity="0" />
          <stop offset="100%" stopColor={NAVY} stopOpacity="0.3" />
        </radialGradient>
      </defs>

      <circle cx="50" cy="50" r="47" fill={`url(#${sphere})`} stroke="#c4ccc8" strokeWidth="1" />

      {/* Nur das PANEL-Muster rotiert. */}
      <g transform={`rotate(${rotation} 50 50)`}>
        <g stroke={NAVY} strokeWidth="2.6" strokeLinecap="round">
          {edge.map((e, i) => (
            <line key={i} x1={e.vx} y1={e.vy} x2={e.cx} y2={e.cy} />
          ))}
        </g>
        <polygon points={pentagon(50, 50, 18)} fill={NAVY} />
        <g fill={NAVY}>
          {edge.map((e, i) => (
            <polygon key={i} points={pentagon(e.cx, e.cy, 8.5, e.rot)} />
          ))}
        </g>
      </g>

      <circle cx="50" cy="50" r="47" fill={`url(#${shade})`} />
    </svg>
  );
};

/* ------------------------------- Konfetti --------------------------------- */

/**
 * Ein echter Konfetti-Burst: Partikel schießen aus einem Punkt nach oben-außen
 * und fallen dann unter „Schwerkraft" zurück. Physik, kein Faken — genau die
 * Jubel-Geste. Farben aus der Marke plus Weiß.
 */
export const ConfettiBurst: React.FC<{
  count?: number;
  originYFactor?: number;
  startFrame?: number;
}> = ({ count = 90, originYFactor = 0.5, startFrame = 0 }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const cx = width / 2;
  const cy = height * originYFactor;
  const colors = [GREEN, "#00563A", NAVY, WHITE, "#FFC53D"];
  const g = 2200; // px/s²

  return (
    <>
      {new Array(count).fill(0).map((_, i) => {
        const delay = random(`d${i}`) * 8;
        const t = (frame - startFrame - delay) / fps;
        if (t < 0) return null;
        // Aufwärts-Kegel: -90° ± Streuung
        const ang = (-90 + (random(`a${i}`) - 0.5) * 150) * (Math.PI / 180);
        const speed = 900 + random(`s${i}`) * 1400;
        const vx = Math.cos(ang) * speed;
        const vy = Math.sin(ang) * speed;
        const x = cx + vx * t;
        const y = cy + vy * t + 0.5 * g * t * t;
        if (y > height + 60) return null;
        const size = 12 + random(`z${i}`) * 16;
        const rot = random(`r${i}`) * 360 + t * (200 + random(`w${i}`) * 400);
        const color = colors[Math.floor(random(`c${i}`) * colors.length)];
        const round = random(`o${i}`) > 0.6;
        const opacity = interpolate(t, [0, 0.1, 1.6, 2.1], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp"
        });
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: x,
              top: y,
              width: size,
              height: round ? size : size * 0.5,
              background: color,
              borderRadius: round ? size : 2,
              transform: `rotate(${rot}deg)`,
              opacity
            }}
          />
        );
      })}
    </>
  );
};

/* ------------------------------ Equalizer --------------------------------- */

/**
 * Tanzende Balken — der Spotify-Nod im Wrapped-Intro. Jeder Balken schwingt mit
 * eigener Frequenz/Phase, damit es lebt statt gleichzeitig zu pumpen.
 */
export const Equalizer: React.FC<{ bars?: number; width?: number; maxHeight?: number }> = ({
  bars = 5,
  width = 22,
  maxHeight = 120
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: maxHeight }}>
      {new Array(bars).fill(0).map((_, i) => {
        const speed = 4 + i * 1.3;
        const phase = i * 1.7;
        const h = (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * speed + phase))) * maxHeight;
        return (
          <div
            key={i}
            style={{ width, height: h, background: GREEN, borderRadius: width / 2 }}
          />
        );
      })}
    </div>
  );
};
