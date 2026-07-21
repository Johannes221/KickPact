import React from "react";
import { AbsoluteFill, Series, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { CalendarBlank, Confetti, MapPin, Ranking } from "@phosphor-icons/react";
import { GREEN, GREEN_DARK, LOGO_LIGHT, LOGO_WHITE, NAVY, OFF_WHITE, storyShot, WHITE } from "./theme";
import {
  Body,
  Headline,
  Kicker,
  Logo,
  PhIcon,
  PhoneSwipe,
  Progress,
  RollingBall,
  Scene,
  useEnter
} from "./kit";

/**
 * Reel „Spiel ankündigen" (Spieltag) — Kern: Spieltag, keiner baut die Grafik,
 * die App macht sie (ein Tipp → fertige Instagram-Story). Herzstück ist der
 * iPhone-Swipe durch die ECHTEN Story-Bilder (Vorschau + Rückblick) aus der App.
 * Copy neu getextet, ohne die hohle „presented by KickPact"-Zeile von vorher.
 */

export const SCENES = [84, 66, 180, 132, 78, 90] as const;
export const DURATION = SCENES.reduce((a, b) => a + b, 0);

/** Was automatisch auf der Story steht — Häkchen poppen nacheinander rein. */
const CheckItem: React.FC<{ icon: PhIcon; label: string; index: number }> = ({
  icon: Icon,
  label,
  index
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const delay = 14 + index * 9;
  const pop = spring({ frame: frame - delay, fps, config: { damping: 13, mass: 0.7 } });
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 26,
        background: OFF_WHITE,
        borderRadius: 26,
        padding: "26px 34px",
        marginBottom: 20,
        opacity: Math.min(1, pop),
        transform: `translateX(${(1 - Math.min(1, pop)) * 80}px)`
      }}
    >
      <div
        style={{
          width: 72,
          height: 72,
          borderRadius: 18,
          background: WHITE,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0
        }}
      >
        <Icon size={40} weight="duotone" color={GREEN_DARK} />
      </div>
      <div style={{ flex: 1, fontSize: 46, fontWeight: 700, color: NAVY }}>{label}</div>
      <div style={{ fontFamily: "KickPact Display", fontSize: 52, fontWeight: 900, color: GREEN }}>✓</div>
    </div>
  );
};

const Intro: React.FC = () => (
  <Scene bg={NAVY}>
    <RollingBall y={1360} />
    <div style={{ marginBottom: 44 }}>
      <Logo src={LOGO_WHITE} width={520} delay={4} />
    </div>
    <Headline color={WHITE} size={92} delay={10}>
      Spieltag. Und wieder bastelt keiner die Grafik.
    </Headline>
  </Scene>
);

const OneTap: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // Pulsierender Tap-Ring.
  const pulse = 0.5 + 0.5 * Math.sin((frame / fps) * 6);
  const s = spring({ frame: frame - 6, fps, config: { damping: 14 } });
  return (
    <Scene bg={WHITE}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div style={{ position: "relative", width: 220, height: 220, marginBottom: 50 }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: `8px solid ${GREEN}`,
              opacity: (1 - pulse) * 0.7,
              transform: `scale(${1 + pulse * 0.5})`
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 40,
              borderRadius: "50%",
              background: GREEN,
              transform: `scale(${Math.min(1, s)})`
            }}
          />
        </div>
        <Headline size={100} delay={4}>
          Ein Tipp.
        </Headline>
      </div>
    </Scene>
  );
};

const Preview: React.FC = () => (
  <Scene bg={OFF_WHITE}>
    <div style={{ marginBottom: 32, ...useEnter(2) }}>
      <Kicker text="Fertig aus der App" delay={2} />
      <Headline size={78} delay={6}>
        Vorher die Vorschau, danach das Ergebnis.
      </Headline>
    </div>
    <PhoneSwipe shots={[storyShot("spiel-vorschau"), storyShot("spiel-rueckblick")]} width={500} hold={64} />
  </Scene>
);

const OnIt: React.FC = () => (
  <Scene bg={WHITE}>
    <Kicker text="Automatisch drauf" delay={2} />
    <Headline size={80} delay={6}>
      Nichts selbst eintippen.
    </Headline>
    <div style={{ marginTop: 48 }}>
      <CheckItem icon={MapPin} label="Gegner, Heim oder Auswärts" index={0} />
      <CheckItem icon={CalendarBlank} label="Datum und Anstoß" index={1} />
      <CheckItem icon={Ranking} label="Tabellenplatz beider Teams" index={2} />
      <CheckItem icon={Confetti} label="Nach Abpfiff: Ergebnis + Torschützen" index={3} />
    </div>
  </Scene>
);

const Share: React.FC = () => (
  <Scene bg={NAVY}>
    <Headline color={WHITE} size={94} delay={6}>
      Geteilt in zehn Sekunden.
    </Headline>
    <Body color="rgba(255,255,255,0.72)" delay={16}>
      Direkt in eure Instagram-Story. Kein Photoshop, keine Vorlage.
    </Body>
  </Scene>
);

const CTA: React.FC = () => (
  <Scene bg={WHITE}>
    <RollingBall y={1380} size={130} />
    <div style={{ marginBottom: 40 }}>
      <Logo src={LOGO_LIGHT} width={480} delay={2} />
    </div>
    <Headline size={84} delay={8}>
      Eine fertige Story zu jedem Spiel.
    </Headline>
    <Body delay={18}>Ab 4,99 € im Monat pro Mannschaft. 30 Tage kostenlos. kickpact.com</Body>
  </Scene>
);

export const SpielAnkuendigen: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: WHITE }}>
    <Series>
      <Series.Sequence durationInFrames={SCENES[0]}>
        <Intro />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[1]}>
        <OneTap />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[2]}>
        <Preview />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[3]}>
        <OnIt />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[4]}>
        <Share />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[5]}>
        <CTA />
      </Series.Sequence>
    </Series>
    <Progress total={DURATION} />
  </AbsoluteFill>
);
