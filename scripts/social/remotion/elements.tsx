import React from "react";
import { SoccerBall as PhSoccerBall } from "@phosphor-icons/react";
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
 * Der Fußball: professionelles Muster aus der Phosphor-Icon-Library (MIT) auf
 * einer schattierten Kugel-Basis. Das handgezeichnete Muster von vorher sah
 * unecht aus (Johannes) — die Library liefert einen sauber gestalteten Ball.
 *
 * Aufbau in drei Schichten, damit er auf HELL wie DUNKEL funktioniert und beim
 * Rollen echt wirkt:
 *   1. weiße Kugel mit CSS-Verlauf + Innenschatten (Volumen, festes Licht),
 *   2. das Phosphor-Muster in Navy, das MITdreht (nur diese Schicht rotiert),
 *   3. der weiße Ball trägt das Navy-Muster — sichtbar auf jedem Hintergrund.
 */
export const SoccerBall: React.FC<{ size: number; rotation?: number }> = ({ size, rotation = 0 }) => (
  <div style={{ position: "relative", width: size, height: size }}>
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: "50%",
        background: "radial-gradient(circle at 38% 32%, #ffffff 0%, #eef1ef 58%, #ccd5d1 100%)",
        boxShadow: "inset -9px -11px 20px rgba(26,26,46,0.22), 0 2px 6px rgba(26,26,46,0.14)"
      }}
    />
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: `rotate(${rotation}deg)`
      }}
    >
      <PhSoccerBall size={size} weight="duotone" color={NAVY} />
    </div>
  </div>
);

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
