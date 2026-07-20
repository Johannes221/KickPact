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
  WHITE
} from "./theme";
import { ConfettiBurst, Equalizer, SoccerBall } from "./elements";

/**
 * Das Saison-Rückblick-Reel (Wrapped) — der virale Aufhänger, jetzt mit echter
 * Motion: ein Ball rollt und springt, Zahlen zählen hoch, beim Jubel regnet
 * Konfetti. Handgebaute Szenen (kein generisches Beat-Mapping) — der Hero-Reel
 * darf die beste Choreografie kriegen; die Verallgemeinerung auf die übrigen
 * Spots kommt, wenn der Look sitzt.
 *
 * Alle Zahlen sind bewusst Beispiel/Vorschau („so sieht euer Rückblick aus"),
 * keine Behauptung über eine echte Mannschaft.
 */

/** Szenenlängen in Frames (@30 fps). Summe = Composition-Dauer, s. Root.tsx. */
export const SCENES = [78, 72, 138, 90, 84, 96, 96] as const;
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

/** Karte mit grünem Balken, Label und hochzählendem Wert. */
const StatCard: React.FC<{
  label: string;
  target: number;
  suffix?: string;
  index: number;
  ball?: boolean;
}> = ({ label, target, suffix = "", index, ball }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const delay = 12 + index * 9;
  const slide = spring({ frame: frame - delay, fps, config: { damping: 15, mass: 0.7 } });
  const count = spring({ frame: frame - delay, fps, config: { damping: 200 } });
  const value = Math.round(target * count);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        width: "100%",
        background: OFF_WHITE,
        borderRadius: 26,
        padding: "28px 36px",
        marginBottom: 20,
        opacity: Math.min(1, Math.max(0, slide)),
        transform: `translateX(${(1 - slide) * 90}px)`
      }}
    >
      <div style={{ width: 12, height: 100, background: GREEN, borderRadius: 6, marginRight: 30 }} />
      <div style={{ flex: 1, fontSize: 46, fontWeight: 700, color: NAVY }}>{label}</div>
      {ball && (
        <div style={{ marginRight: 22, display: "flex" }}>
          <SoccerBall size={58} rotation={frame * 7} />
        </div>
      )}
      <div style={{ fontFamily: DISPLAY, fontSize: 68, fontWeight: 900, color: GREEN_DARK }}>
        {value}
        {suffix}
      </div>
    </div>
  );
};

/** Ein großer „X Comebacks"-Block, der mit Overshoot aufpoppt. */
const BigStat: React.FC<{ value: string; label: string; delay: number }> = ({ value, label, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping: 11, mass: 0.8 } });
  return (
    <div style={{ transform: `scale(${s})`, opacity: Math.min(1, s), textAlign: "center" }}>
      <div style={{ fontFamily: DISPLAY, fontSize: 180, fontWeight: 900, color: GREEN, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 40, fontWeight: 700, color: WHITE, marginTop: 10 }}>{label}</div>
    </div>
  );
};

/* --------------------------------- Szenen --------------------------------- */

/** Ball, der über den unteren Rand rollt (Intro + CTA). */
const RollingBall: React.FC<{ size?: number; y: number }> = ({ size = 150, y }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const x = interpolate(frame, [0, 60], [-size, width * 0.5 - size / 2], {
    extrapolateRight: "clamp",
    easing: (t) => 1 - Math.pow(1 - t, 3)
  });
  return (
    <div style={{ position: "absolute", left: x, top: y, display: "flex" }}>
      <SoccerBall size={size} rotation={(x / (size * Math.PI)) * 360} />
    </div>
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

const WrappedLike: React.FC = () => (
  <Scene bg={WHITE}>
    <div style={{ marginBottom: 56 }}>
      <Equalizer bars={5} width={26} maxHeight={150} />
    </div>
    <Kicker text="Wie Spotify Wrapped" delay={4} />
    <Headline size={104} delay={10}>
      Nur für eure Mannschaft.
    </Headline>
  </Scene>
);

const Stats: React.FC = () => (
  <Scene bg={WHITE}>
    <Kicker text="Eure Saison in Zahlen" delay={2} />
    <Headline size={80} delay={6}>
      Alles automatisch gezählt.
    </Headline>
    <div style={{ marginTop: 46 }}>
      <StatCard label="Tore" target={34} index={0} ball />
      <StatCard label="Siege" target={12} index={1} />
      <StatCard label="Endplatz" target={3} suffix="." index={2} />
    </div>
  </Scene>
);

const Toptorjaeger: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Ball hüpft: |sin| als „Absprung", mit abklingender Höhe.
  const bounce = Math.abs(Math.sin((frame / fps) * 3.4)) * 70;
  return (
    <Scene bg={WHITE}>
      <div style={{ position: "absolute", top: 300, left: "50%", marginLeft: -70 }}>
        <div style={{ transform: `translateY(${-bounce}px)`, display: "flex" }}>
          <SoccerBall size={140} rotation={frame * 5} />
        </div>
      </div>
      <div style={{ marginTop: 240 }}>
        <Kicker text="Euer Toptorjäger" delay={2} />
        <Headline size={88} delay={8}>
          Steht am Ende fest.
        </Headline>
        <Body delay={16}>Wer wie oft getroffen hat — die App weiß es.</Body>
      </div>
    </Scene>
  );
};

const Comebacks: React.FC = () => (
  <Scene bg={NAVY}>
    <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center" }}>
      <BigStat value="5" label="Comebacks" delay={6} />
      <BigStat value="8×" label="zu null" delay={16} />
    </div>
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
          <WrappedLike />
        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENES[2]}>
          <Stats />
        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENES[3]}>
          <Toptorjaeger />
        </Series.Sequence>
        <Series.Sequence durationInFrames={SCENES[4]}>
          <Comebacks />
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
