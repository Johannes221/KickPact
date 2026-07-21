import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  Series,
  spring,
  useCurrentFrame,
  useVideoConfig
} from "remotion";
import {
  ArrowsClockwise,
  Medal,
  Shield,
  SoccerBall as PhSoccerBall,
  Target,
  Trophy
} from "@phosphor-icons/react";
import {
  BODY,
  DISPLAY,
  GREEN,
  GREEN_DARK,
  LOGO_RATIO,
  LOGO_LIGHT,
  LOGO_WHITE,
  NAVY,
  OFF_WHITE,
  photoSrc,
  typo,
  WHITE,
  wrappedShot
} from "./theme";
import { ConfettiBurst, Equalizer, SoccerBall } from "./elements";

/**
 * Das Saison-Rückblick-Reel (Wrapped) — der virale Aufhänger, jetzt mit echter
 * Motion UND vollen Slides: ein dichtes Recap-Raster (mehrere Widgets auf einem
 * Bild statt einer Zahl pro Karte), ein Toptorjäger-Leaderboard und ein iPhone,
 * das durch die ECHTEN Wrapped-Karten der App wischt. Der Hero-Reel kriegt die
 * beste Choreografie; die Verallgemeinerung auf die übrigen Spots kommt danach.
 *
 * Alle Zahlen sind bewusst Beispiel/Vorschau („so sieht euer Rückblick aus"),
 * keine Behauptung über eine echte Mannschaft.
 */

/** Szenenlängen in Frames (@30 fps). Summe = Composition-Dauer, s. Root.tsx.
 *  Reihenfolge: Intro, WrappedTitle, RecapGrid, PhoneSwipe, Leaderboard,
 *  Celebration, CTA. */
export const SCENES = [72, 60, 156, 168, 108, 90, 96] as const;
export const DURATION = SCENES.reduce((a, b) => a + b, 0);

/* ------------------------------- Bausteine -------------------------------- */

const PAD = 96;

const Scene: React.FC<{ bg: string; children: React.ReactNode }> = ({ bg, children }) => (
  <AbsoluteFill
    style={{
      backgroundColor: bg,
      padding: PAD,
      justifyContent: "center",
      fontFamily: BODY,
      overflow: "hidden"
    }}
  >
    {children}
  </AbsoluteFill>
);

/** Weiches Einfedern (Overshoot) — Position + Deckkraft, an `delay` versetzt. */
function useEnter(delay = 0) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 14, mass: 0.7 } });
  return { opacity: Math.min(1, Math.max(0, s)), transform: `translateY(${(1 - s) * 52}px)` };
}

const Kicker: React.FC<{ text: string; color?: string; delay?: number }> = ({
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

const Headline: React.FC<{ children: React.ReactNode; color?: string; size?: number; delay?: number }> = ({
  children,
  color = NAVY,
  size = 96,
  delay = 6
}) => (
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

const Body: React.FC<{ children: React.ReactNode; color?: string; delay?: number }> = ({
  children,
  color = "rgba(26,26,46,0.66)",
  delay = 14
}) => (
  <div style={{ fontSize: 42, lineHeight: 1.4, color, marginTop: 30, maxWidth: 820, ...useEnter(delay) }}>
    {children}
  </div>
);

const Logo: React.FC<{ src: string; width?: number; delay?: number }> = ({
  src,
  width = 520,
  delay = 0
}) => (
  <div style={{ ...useEnter(delay) }}>
    <Img src={src} style={{ width, height: width / LOGO_RATIO }} />
  </div>
);

/** Hochzähler: 0 → target, weich ausgebremst (kein Nachwippen bei Zahlen). */
function useCount(target: number, delay: number): number {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const c = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  return Math.round(target * c);
}

type PhIcon = React.ComponentType<{ size?: number; weight?: "duotone" | "fill" | "bold"; color?: string }>;

/* --------------------------- Recap-Raster --------------------------------- */

/**
 * EIN Widget im Raster: Icon, hochzählende Zahl, Label — kompakt, damit sechs
 * davon auf eine Slide passen (das war der Wunsch: voller, ein kompletter Recap,
 * nicht eine Zahl pro Bild). Kommt gestaffelt mit Feder rein.
 */
const StatTile: React.FC<{
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

const RECAP_TILES: { icon: PhIcon; target: number; suffix?: string; label: string }[] = [
  { icon: PhSoccerBall, target: 34, label: "Tore" },
  { icon: Trophy, target: 9, label: "Siege" },
  { icon: Shield, target: 6, label: "Zu null" },
  { icon: ArrowsClockwise, target: 4, label: "Comebacks" },
  { icon: Target, target: 87, suffix: "%", label: "Quote" },
  { icon: Medal, target: 2, suffix: ".", label: "Endplatz" }
];

const RecapGrid: React.FC = () => (
  <Scene bg={WHITE}>
    <Kicker text="Eure Saison in Zahlen" delay={2} />
    <Headline size={78} delay={6}>
      Alles automatisch gezählt.
    </Headline>
    <div
      style={{
        marginTop: 52,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 24
      }}
    >
      {RECAP_TILES.map((t, i) => (
        <StatTile key={t.label} {...t} index={i} />
      ))}
    </div>
  </Scene>
);

/* ------------------------------ Leaderboard ------------------------------- */

/** Eine Zeile im Torschützen-Ranking: Rang-Medaille, Name, Balken, Torzahl. */
const RankRow: React.FC<{ rank: number; name: string; goals: number; max: number; index: number }> = ({
  rank,
  name,
  goals,
  max,
  index
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const delay = 16 + index * 12;
  const slide = spring({ frame: frame - delay, fps, config: { damping: 15, mass: 0.7 } });
  const grow = spring({ frame: frame - delay - 4, fps, config: { damping: 200 } });
  const count = useCount(goals, delay);
  const medal = ["#F5B301", "#B8C0C8", "#CD7F32"][rank - 1] ?? OFF_WHITE;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 26,
        marginBottom: 22,
        opacity: Math.min(1, Math.max(0, slide)),
        transform: `translateX(${(1 - slide) * 80}px)`
      }}
    >
      <div
        style={{
          width: 74,
          height: 74,
          borderRadius: "50%",
          background: medal,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontFamily: DISPLAY,
          fontSize: 40,
          fontWeight: 900,
          color: NAVY
        }}
      >
        {rank}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 44, fontWeight: 700, color: NAVY, marginBottom: 12 }}>{name}</div>
        <div style={{ height: 18, borderRadius: 9, background: OFF_WHITE, overflow: "hidden" }}>
          <div
            style={{
              width: `${(goals / max) * 100 * Math.min(1, grow)}%`,
              height: "100%",
              borderRadius: 9,
              background: GREEN
            }}
          />
        </div>
      </div>
      <div style={{ fontFamily: DISPLAY, fontSize: 66, fontWeight: 900, color: GREEN_DARK, width: 120, textAlign: "right" }}>
        {count}
      </div>
    </div>
  );
};

const Leaderboard: React.FC = () => (
  <Scene bg={WHITE}>
    <Kicker text="Eure Toptorjäger" delay={2} />
    <Headline size={80} delay={6}>
      Steht am Ende fest.
    </Headline>
    <div style={{ marginTop: 60 }}>
      <RankRow rank={1} name="Jonas Brandt" goals={14} max={14} index={0} />
      <RankRow rank={2} name="Leon Weber" goals={9} max={14} index={1} />
      <RankRow rank={3} name="Tim Schuster" goals={6} max={14} index={2} />
    </div>
  </Scene>
);

/* --------------------------------- Szenen --------------------------------- */

/**
 * Ball, der ins Bild rollt und dann STEHT — die Drehung folgt dem echten Weg
 * (Umfang = π·Größe) und hört auf, sobald der Ball hält. Kein Dauer-Drehen.
 * Mit weichem Kontaktschatten, damit er auf dem Boden liegt statt zu schweben.
 */
const RollingBall: React.FC<{ size?: number; y: number; from?: "left" | "right" }> = ({
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

const Intro: React.FC = () => (
  <Scene bg={NAVY}>
    <RollingBall y={1360} />
    <div style={{ marginBottom: 44 }}>
      <Logo src={LOGO_WHITE} width={520} delay={4} />
    </div>
    <Headline color={WHITE} size={104} delay={10}>
      Eure Saison. Als Rückblick.
    </Headline>
  </Scene>
);

const WrappedTitle: React.FC = () => (
  <Scene bg={WHITE}>
    <div style={{ marginBottom: 56 }}>
      <Equalizer bars={5} width={26} maxHeight={150} />
    </div>
    <Kicker text="Wie Spotify Wrapped" delay={4} />
    <Headline size={100} delay={10}>
      Nur für eure Mannschaft.
    </Headline>
  </Scene>
);

const Celebration: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 6, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={photoSrc("team-celebration")}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(26,26,46,0.72) 0%, rgba(26,26,46,0.5) 50%, rgba(26,26,46,0.86) 100%)"
        }}
      />
      <ConfettiBurst count={110} originYFactor={0.42} startFrame={4} />
      <AbsoluteFill style={{ padding: PAD, justifyContent: "flex-end", fontFamily: BODY }}>
        <div style={{ opacity: Math.min(1, s), transform: `translateY(${(1 - s) * 50}px)` }}>
          <Kicker text="Fertig gestaltet" color={GREEN} delay={8} />
          <Headline color={WHITE} size={92} delay={12}>
            15 Bilder für eure Story.
          </Headline>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const CTA: React.FC = () => (
  <Scene bg={WHITE}>
    <RollingBall y={1380} size={130} />
    <div style={{ marginBottom: 44 }}>
      <Logo src={LOGO_LIGHT} width={480} delay={2} />
    </div>
    <Headline size={82} delay={8}>
      Mach deinen Saison-Rückblick mit KickPact.
    </Headline>
    <Body delay={18} color="rgba(26,26,46,0.66)">
      30 Tage kostenlos. kickpact.com
    </Body>
  </Scene>
);

/* ----------------------------- iPhone-Mockup ------------------------------ */

/**
 * Ein iPhone-Rahmen, der durch die ECHTEN Wrapped-Karten der App WISCHT — drei
 * Screens hintereinander, jeder gleitet rein und wieder raus. So sieht man, dass
 * der Rückblick ein fertiges App-Feature ist (mit Wappen, echten Zahlen), nicht
 * nur Motion-Grafik. Der Rahmen schwebt sanft und kippt minimal in 3D.
 */
const PhoneFrame: React.FC<{ width: number; children: React.ReactNode; settled: number; frame: number; fps: number }> = ({
  width,
  children,
  settled,
  frame,
  fps
}) => {
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

/** Die drei stärksten Recap-Karten, die im Telefon durchgewischt werden. */
const SWIPE_SLIDES = ["bilanz", "tore", "torschuetze"] as const;

const PhoneSwipe: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 8, fps, config: { damping: 16, mass: 0.9 } });
  const settled = Math.min(1, enter);
  const width = 500;
  // Ein Filmstreifen (3 Karten nebeneinander), der in ganzen Screen-Schritten
  // nach links geschoben wird — so ist IMMER genau eine Karte mittig, der
  // Wechsel ist ein sauberer Push (kein Doppelbild).
  const offset = interpolate(frame, [64, 78, 122, 136], [0, -1, -1, -2], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  return (
    <Scene bg={OFF_WHITE}>
      <div style={{ marginBottom: 36 }}>
        <Kicker text="So sieht's in der App aus" delay={2} />
        <Headline size={76} delay={6}>
          Dein Rückblick zum Teilen.
        </Headline>
      </div>
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
            {SWIPE_SLIDES.map((slide) => (
              <Img
                key={slide}
                src={wrappedShot(slide)}
                style={{
                  width: "100%",
                  height: "100%",
                  flexShrink: 0,
                  objectFit: "contain",
                  background: WHITE
                }}
              />
            ))}
          </div>
        </PhoneFrame>
      </div>
    </Scene>
  );
};

/* ------------------------------ Fortschritt ------------------------------- */

const Progress: React.FC = () => {
  const frame = useCurrentFrame();
  const p = Math.min(1, frame / DURATION);
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

/* ------------------------------- Composition ------------------------------ */

export const Reel: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: WHITE }}>
      <Series>
        <Series.Sequence durationInFrames={SCENES[0]}>
          <Intro />
        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENES[1]}>
          <WrappedTitle />
        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENES[2]}>
          <RecapGrid />
        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENES[3]}>
          <PhoneSwipe />
        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENES[4]}>
          <Leaderboard />
        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENES[5]}>
          <Celebration />
        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENES[6]}>
          <CTA />
        </Series.Sequence>
      </Series>
      <Progress />
    </AbsoluteFill>
  );
};
