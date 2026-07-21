import React from "react";
import { Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import {
  BODY,
  DISPLAY,
  GREEN,
  GREEN_DARK,
  LOGO_RATIO,
  NAVY,
  OFF_WHITE,
  typo,
  WHITE
} from "./theme";
import { SoccerBall } from "./elements";

/**
 * Der gemeinsame Motion-Baukasten für ALLE Reels. Extrahiert aus dem
 * Wrapped-Reel (2026-07-21), den Johannes als Referenz-Look abgesegnet hat:
 * volle Screens, echte Bewegung (aufpoppen, reinfliegen, hochzählen, wischen),
 * echte App-Vorschauen im iPhone. Neue Reels bauen NUR aus diesen Teilen, damit
 * der Look konsistent bleibt.
 */

export const PAD = 96;

export const Scene: React.FC<{ bg: string; children: React.ReactNode }> = ({ bg, children }) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      backgroundColor: bg,
      padding: PAD,
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
      fontFamily: BODY,
      overflow: "hidden"
    }}
  >
    {children}
  </div>
);

/** Weiches Einfedern (Overshoot) — Position + Deckkraft, an `delay` versetzt. */
export function useEnter(delay = 0) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, mass: 0.7 } });
  return { opacity: Math.min(1, Math.max(0, s)), transform: `translateY(${(1 - s) * 52}px)` };
}

/** Hochzähler: 0 → target, weich ausgebremst (kein Nachwippen bei Zahlen). */
export function useCount(target: number, delay: number): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return Math.round(target * c);
}

export type PhIcon = React.ComponentType<{
  size?: number;
  weight?: "duotone" | "fill" | "bold";
  color?: string;
}>;

export const Kicker: React.FC<{ text: string; color?: string; delay?: number }> = ({
  text,
  color = GREEN_DARK,
  delay = 0
}) => (
  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 26, ...useEnter(delay) }}>
    <div style={{ width: 34, height: 8, borderRadius: 4, background: color }} />
    <div
      style={{
        fontSize: 30,
        fontWeight: 700,
        color,
        letterSpacing: "0.16em",
        textTransform: "uppercase"
      }}
    >
      {typo(text)}
    </div>
  </div>
);

export const Headline: React.FC<{
  children: React.ReactNode;
  color?: string;
  size?: number;
  delay?: number;
}> = ({ children, color = NAVY, size = 96, delay = 6 }) => (
  <div
    style={{
      fontFamily: DISPLAY,
      fontSize: size,
      fontWeight: 900,
      color,
      letterSpacing: "-0.02em",
      lineHeight: 1.04,
      ...useEnter(delay)
    }}
  >
    {children}
  </div>
);

export const Body: React.FC<{ children: React.ReactNode; color?: string; delay?: number }> = ({
  children,
  color = "rgba(26,26,46,0.66)",
  delay = 14
}) => (
  <div style={{ fontSize: 42, lineHeight: 1.4, color, marginTop: 30, maxWidth: 820, ...useEnter(delay) }}>
    {children}
  </div>
);

export const Logo: React.FC<{ src: string; width?: number; delay?: number }> = ({
  src,
  width = 520,
  delay = 0
}) => (
  <div style={{ ...useEnter(delay) }}>
    <Img src={src} style={{ width, height: width / LOGO_RATIO }} />
  </div>
);

/** Karte mit Icon, hochzählender Zahl, Label — für dichte Recap-Raster. */
export const StatTile: React.FC<{
  icon: PhIcon;
  target: number;
  suffix?: string;
  label: string;
  index: number;
}> = ({ icon: Icon, target, suffix = "", label, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const delay = 14 + index * 7;
  const pop = spring({ frame: frame - delay, fps, config: { damping: 13, mass: 0.7 } });
  const value = useCount(target, delay);
  return (
    <div
      style={{
        background: OFF_WHITE,
        borderRadius: 34,
        padding: "40px 36px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        opacity: Math.min(1, pop),
        transform: `scale(${0.86 + 0.14 * Math.min(1, pop)})`,
        transformOrigin: "center"
      }}
    >
      <Icon size={66} weight="duotone" color={GREEN_DARK} />
      <div style={{ fontFamily: DISPLAY, fontSize: 96, fontWeight: 900, color: NAVY, lineHeight: 1 }}>
        {value}
        {suffix}
      </div>
      <div style={{ fontSize: 34, fontWeight: 700, color: "rgba(26,26,46,0.6)" }}>{label}</div>
    </div>
  );
};

/**
 * Eine Pact-Karte („Pro Tor … 5 €"): Label links, Betrag rechts als grüne
 * Pille. Fliegt gestaffelt von der Seite rein. Optional `strike` = durchge-
 * strichen (für „die falschen Sponsoren").
 */
export const PactChip: React.FC<{
  label: string;
  amount: string;
  index: number;
  icon?: PhIcon;
  baseDelay?: number;
}> = ({ label, amount, index, icon: Icon, baseDelay = 12 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const delay = baseDelay + index * 9;
  const s = spring({ frame: frame - delay, fps, config: { damping: 15, mass: 0.7 } });
  const settled = Math.min(1, Math.max(0, s));
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 24,
        width: "100%",
        background: WHITE,
        border: `2px solid ${OFF_WHITE}`,
        borderRadius: 28,
        padding: "26px 32px",
        marginBottom: 20,
        boxShadow: "0 8px 24px rgba(26,26,46,0.05)",
        opacity: settled,
        transform: `translateX(${(1 - s) * 110}px)`
      }}
    >
      {Icon ? (
        <div
          style={{
            width: 74,
            height: 74,
            borderRadius: 18,
            background: OFF_WHITE,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0
          }}
        >
          <Icon size={42} weight="duotone" color={GREEN_DARK} />
        </div>
      ) : null}
      <div style={{ flex: 1, fontSize: 46, fontWeight: 700, color: NAVY }}>{label}</div>
      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: 52,
          fontWeight: 900,
          color: WHITE,
          background: GREEN,
          borderRadius: 18,
          padding: "10px 26px",
          whiteSpace: "nowrap"
        }}
      >
        {typo(amount)}
      </div>
    </div>
  );
};

/**
 * Großer €-Zähler, der von 0 hochläuft — „so füllt sich die Kasse". Mit
 * kleinem Overshoot-Pop beim Erscheinen.
 */
export const MoneyCounter: React.FC<{ target: number; label: string; delay?: number }> = ({
  target,
  label,
  delay = 8
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - delay, fps, config: { damping: 12, mass: 0.8 } });
  const value = useCount(target, delay);
  return (
    <div style={{ transform: `scale(${Math.min(1, pop)})`, opacity: Math.min(1, pop), textAlign: "center" }}>
      <div style={{ fontFamily: DISPLAY, fontSize: 240, fontWeight: 900, color: GREEN, lineHeight: 1 }}>
        {value} €
      </div>
      <div style={{ fontSize: 46, fontWeight: 700, color: WHITE, marginTop: 12 }}>{label}</div>
    </div>
  );
};

/**
 * Ball, der ins Bild rollt und dann STEHT — Drehung folgt dem echten Weg
 * (Umfang = π·Größe) und hört auf, sobald der Ball hält. Mit Kontaktschatten.
 */
export const RollingBall: React.FC<{ size?: number; y: number; from?: "left" | "right" }> = ({
  size = 150,
  y,
  from = "left"
}) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const target = width * 0.5 - size / 2;
  const start = from === "left" ? -size - 40 : width + 40;
  const x = interpolate(frame, [0, 62], [start, target], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3)
  });
  const rotation = ((x - start) / (size * Math.PI)) * 360;
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: x,
          top: y + size * 0.86,
          width: size,
          display: "flex",
          justifyContent: "center"
        }}
      >
        <div
          style={{
            width: size * 0.78,
            height: size * 0.16,
            borderRadius: "50%",
            background: "rgba(26,26,46,0.22)",
            filter: "blur(9px)"
          }}
        />
      </div>
      <div style={{ position: "absolute", left: x, top: y, display: "flex" }}>
        <SoccerBall size={size} rotation={rotation} />
      </div>
    </>
  );
};

/**
 * iPhone-Rahmen, der schwebt und minimal in 3D kippt. `children` ist der
 * Bildschirminhalt (Filmstrip, Screenshot …). `settled` = 0…1 Einflug-Zustand.
 */
export const PhoneFrame: React.FC<{
  width: number;
  children: React.ReactNode;
  settled: number;
  frame: number;
  fps: number;
}> = ({ width, children, settled, frame, fps }) => {
  const height = width * (2532 / 1170); // iPhone @3x
  const float = Math.sin((frame / fps) * 1.6) * 8;
  const tilt = Math.sin((frame / fps) * 1.05) * 1.4;
  const bezel = width * 0.028;
  const radius = width * 0.14;
  return (
    <div
      style={{
        width,
        height,
        opacity: settled,
        transform: `perspective(1600px) translateY(${(1 - settled) * 130 + float}px) rotateY(${tilt}deg) scale(${0.9 + 0.1 * settled})`,
        transformOrigin: "center",
        background: NAVY,
        borderRadius: radius,
        padding: bezel,
        boxShadow: "0 30px 60px rgba(26,26,46,0.28)",
        display: "flex"
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: radius - bezel,
          overflow: "hidden",
          position: "relative",
          background: WHITE
        }}
      >
        {children}
      </div>
    </div>
  );
};

/**
 * Ein iPhone, das durch mehrere hochkant-Bilder (9:16) WISCHT — Filmstrip-Push,
 * immer genau eins mittig. `contain`, damit nichts beschnitten wird (Karten
 * sind eh weiß → randlos). `holds` = Frames pro Bild.
 */
export const PhoneSwipe: React.FC<{ shots: string[]; width?: number; hold?: number }> = ({
  shots,
  width = 500,
  hold = 52
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 8, fps, config: { damping: 16, mass: 0.9 } });
  const settled = Math.min(1, enter);
  // Filmstrip-Offset: nach jedem `hold` einen Screen weiter, 14-Frame-Übergang.
  const kf: number[] = [];
  const kv: number[] = [];
  shots.forEach((_, i) => {
    const hitStart = 20 + i * hold;
    kf.push(hitStart);
    kv.push(-i);
    if (i < shots.length - 1) {
      kf.push(hitStart + hold - 14);
      kv.push(-i);
    }
  });
  const offset = interpolate(frame, kf, kv, {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <PhoneFrame width={width} settled={settled} frame={frame} fps={fps}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            transform: `translateX(${offset * 100}%)`
          }}
        >
          {shots.map((src, i) => (
            <Img
              key={i}
              src={src}
              style={{ width: "100%", height: "100%", flexShrink: 0, objectFit: "contain", background: WHITE }}
            />
          ))}
        </div>
      </PhoneFrame>
    </div>
  );
};

/**
 * Vollbild-Foto mit dunklem Verlauf und unten sitzendem Text — für den
 * „Mensch dahinter"-Beat. Foto zoomt langsam (Ken-Burns), Text kommt mit Feder.
 */
export const PhotoScene: React.FC<{
  src: string;
  kicker?: string;
  headline: React.ReactNode;
  body?: string;
}> = ({ src, kicker, headline, body }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 6, fps, config: { damping: 14 } });
  const zoom = 1.06 + (frame / fps) * 0.012;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", fontFamily: BODY }}>
      <Img
        src={src}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${zoom})`
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(26,26,46,0.35) 0%, rgba(26,26,46,0.2) 45%, rgba(26,26,46,0.88) 100%)"
        }}
      />
      <div style={{ position: "absolute", inset: 0, padding: PAD, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div style={{ opacity: Math.min(1, s), transform: `translateY(${(1 - s) * 50}px)` }}>
          {kicker ? <Kicker text={kicker} color={GREEN} delay={8} /> : null}
          <Headline color={WHITE} size={92} delay={12}>
            {headline}
          </Headline>
          {body ? (
            <Body color="rgba(255,255,255,0.82)" delay={20}>
              {body}
            </Body>
          ) : null}
        </div>
      </div>
    </div>
  );
};

/** Fortschrittsbalken oben — `total` = Composition-Dauer in Frames. */
export const Progress: React.FC<{ total: number }> = ({ total }) => {
  const frame = useCurrentFrame();
  const p = Math.min(1, frame / total);
  return (
    <div
      style={{
        position: "absolute",
        top: PAD * 0.7,
        left: PAD,
        right: PAD,
        height: 8,
        borderRadius: 4,
        background: "rgba(150,150,160,0.28)"
      }}
    >
      <div style={{ width: `${p * 100}%`, height: 8, borderRadius: 4, background: GREEN }} />
    </div>
  );
};
