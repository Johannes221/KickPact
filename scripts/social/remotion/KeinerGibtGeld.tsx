import React from "react";
import { AbsoluteFill, Series, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SoccerBall, Trophy } from "@phosphor-icons/react";
import { GREEN, LOGO_LIGHT, NAVY, OFF_WHITE, WHITE } from "./theme";
import { Body, Headline, Kicker, Logo, PactChip, Progress, RollingBall, Scene } from "./kit";

/**
 * Reel „Keiner gibt einfach Geld" — die Psychologie: um eine Spende bitten floppt,
 * eine Erfolgs-Wette („5 € pro Tor") sagt jeder sofort zu. Erzählt über einen
 * kleinen Chat-Verlauf (Onkel). Ton: augenzwinkernd + warm. Kalt-tauglich.
 */

export const SCENES = [132, 138, 120, 84, 96] as const;
export const DURATION = SCENES.reduce((a, b) => a + b, 0);

/** Eine Chat-Blase, die mit Feder aufpoppt. side=right = du (grün). */
const Bubble: React.FC<{
  text: string;
  side: "left" | "right";
  delay: number;
  seen?: boolean;
}> = ({ text, side, delay, seen }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - delay, fps, config: { damping: 14, mass: 0.7 } });
  const right = side === "right";
  return (
    <div
      style={{
        alignSelf: right ? "flex-end" : "flex-start",
        maxWidth: "82%",
        opacity: Math.min(1, pop),
        transform: `translateY(${(1 - Math.min(1, pop)) * 28}px) scale(${0.9 + 0.1 * Math.min(1, pop)})`,
        transformOrigin: right ? "right bottom" : "left bottom"
      }}
    >
      <div
        style={{
          background: right ? GREEN : OFF_WHITE,
          color: right ? WHITE : NAVY,
          fontSize: 44,
          fontWeight: 600,
          lineHeight: 1.3,
          padding: "28px 34px",
          borderRadius: 34,
          borderBottomRightRadius: right ? 10 : 34,
          borderBottomLeftRadius: right ? 34 : 10
        }}
      >
        {text}
      </div>
      {seen ? (
        <div style={{ textAlign: "right", fontSize: 26, color: "rgba(26,26,46,0.4)", marginTop: 10, paddingRight: 8 }}>
          Gelesen 19:42
        </div>
      ) : null}
    </div>
  );
};

const Ask: React.FC = () => (
  <Scene bg={WHITE}>
    <Kicker text="Der übliche Versuch" delay={2} />
    <Headline size={78} delay={6}>
      „Gibst du was für die Kasse?"
    </Headline>
    <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 56 }}>
      <Bubble text="Onkel, gibst du 50 € für die Mannschaftskasse?" side="right" delay={16} seen />
    </div>
    <Body delay={70} color="rgba(26,26,46,0.5)">
      … und dann kommt nichts zurück.
    </Body>
  </Scene>
);

const Turn: React.FC = () => (
  <Scene bg={WHITE}>
    <Kicker text="Anders gefragt" delay={2} />
    <Headline size={80} delay={6}>
      Auf einmal sagt er Ja.
    </Headline>
    <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 52 }}>
      <Bubble text="Oder: 5 € für jedes Tor, das wir schießen? ⚽" side="right" delay={16} />
      <Bubble text="Bin dabei! 😄" side="left" delay={52} />
    </div>
  </Scene>
);

const Why: React.FC = () => (
  <Scene bg={WHITE}>
    <Kicker text="Warum das zieht" delay={2} />
    <Headline size={80} delay={6}>
      Kein Betteln. Mitfiebern mit Einsatz.
    </Headline>
    <div style={{ marginTop: 44 }}>
      <PactChip label="Pro Tor" amount="5 €" icon={SoccerBall} index={0} />
      <PactChip label="Pro Sieg" amount="10 €" icon={Trophy} index={1} />
    </div>
  </Scene>
);

const Payoff: React.FC = () => (
  <Scene bg={NAVY}>
    <Headline color={WHITE} size={88} delay={6}>
      Und plötzlich schaut er
    </Headline>
    <Headline color={GREEN} size={88} delay={14}>
      jedes Wochenende aufs Ergebnis.
    </Headline>
  </Scene>
);

const CTA: React.FC = () => (
  <Scene bg={WHITE}>
    <RollingBall y={1380} size={130} />
    <div style={{ marginBottom: 44 }}>
      <Logo src={LOGO_LIGHT} width={480} delay={2} />
    </div>
    <Headline size={84} delay={8}>
      Fragt eure Leute richtig.
    </Headline>
    <Body delay={18}>30 Tage kostenlos. Jetzt loslegen: kickpact.com</Body>
  </Scene>
);

export const KeinerGibtGeld: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: WHITE }}>
    <Series>
      <Series.Sequence durationInFrames={SCENES[0]}>
        <Ask />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[1]}>
        <Turn />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[2]}>
        <Why />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[3]}>
        <Payoff />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[4]}>
        <CTA />
      </Series.Sequence>
    </Series>
    <Progress total={DURATION} />
  </AbsoluteFill>
);
