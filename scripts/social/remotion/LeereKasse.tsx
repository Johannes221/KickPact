import React from "react";
import { AbsoluteFill, Series, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { SoccerBall, Trophy } from "@phosphor-icons/react";
import { GREEN, GREEN_DARK, LOGO_LIGHT, NAVY, WHITE } from "./theme";
import {
  Body,
  Headline,
  Kicker,
  Logo,
  MoneyCounter,
  PactChip,
  Progress,
  RollingBall,
  Scene,
  useEnter
} from "./kit";

/**
 * Reel „Die leere Kasse" — Schmerz zuerst (jeder Verein kennt die 6,40-€-Kasse),
 * dann der Ausweg: Geld an Erfolg knüpfen, statt zu betteln. Ton: augenzwinkernd
 * + warm (Memory feedback_reel_motion_style). Kalt-tauglich: Reveal ~5 Sek rein.
 */

export const SCENES = [96, 120, 120, 84, 96] as const;
export const DURATION = SCENES.reduce((a, b) => a + b, 0);

/** Der traurige Kassenstand als Karte. */
const KassenCard: React.FC<{ delay: number }> = ({ delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - delay, fps, config: { damping: 13, mass: 0.8 } });
  return (
    <div
      style={{
        alignSelf: "center",
        background: "rgba(255,255,255,0.06)",
        border: "2px solid rgba(255,255,255,0.14)",
        borderRadius: 40,
        padding: "56px 72px",
        textAlign: "center",
        opacity: Math.min(1, pop),
        transform: `scale(${0.85 + 0.15 * Math.min(1, pop)})`
      }}
    >
      <div style={{ fontSize: 32, fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 20 }}>
        Mannschaftskasse
      </div>
      <div style={{ fontFamily: "KickPact Display", fontSize: 200, fontWeight: 900, color: WHITE, lineHeight: 1 }}>
        6,40 €
      </div>
    </div>
  );
};

const Hook: React.FC = () => (
  <Scene bg={NAVY}>
    <RollingBall y={1420} size={130} />
    <KassenCard delay={4} />
    <div style={{ marginTop: 50, ...useEnter(24) }}>
      <div style={{ fontSize: 46, color: "rgba(255,255,255,0.75)", textAlign: "center", lineHeight: 1.35 }}>
        Reicht nicht mal für einen neuen Ball.
      </div>
    </div>
  </Scene>
);

const Reveal: React.FC = () => (
  <Scene bg={WHITE}>
    <Kicker text="Das Problem ist nicht das Geld" delay={2} />
    <Headline size={80} delay={6}>
      Sondern der Weg, es zu bekommen.
    </Headline>
    <div style={{ marginTop: 44 }}>
      <PactChip label="Pro Tor" amount="5 €" icon={SoccerBall} index={0} />
      <PactChip label="Pro Sieg" amount="10 €" icon={Trophy} index={1} />
    </div>
    <Body delay={40}>Leute versprechen kleine Beträge pro Erfolg. Direkt in eure Kasse.</Body>
  </Scene>
);

const Fill: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Scene bg={NAVY}>
      <div style={{ position: "absolute", top: 230, left: 0, right: 0, textAlign: "center", ...useEnter(2) }}>
        <div style={{ fontSize: 32, fontWeight: 700, color: GREEN, letterSpacing: "0.16em", textTransform: "uppercase" }}>
          Eine Saison später
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <MoneyCounter target={240} label="in derselben Kasse" delay={10} />
      </div>
      <div style={{ position: "absolute", bottom: 230, left: 96, right: 96, textAlign: "center", opacity: Math.min(1, Math.max(0, (frame - 60) / 20)) }}>
        <div style={{ fontSize: 40, color: "rgba(255,255,255,0.7)" }}>Ein Tor nach dem anderen.</div>
      </div>
    </Scene>
  );
};

const Payoff: React.FC = () => (
  <Scene bg={WHITE}>
    <Kicker text="Aus leer wird voll" delay={2} />
    <Headline size={92} delay={8}>
      Keiner muss betteln.
    </Headline>
    <Headline size={92} color={GREEN_DARK} delay={16}>
      Ihr müsst nur spielen.
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
      Macht eure Mannschaftskasse voll.
    </Headline>
    <Body delay={18}>30 Tage kostenlos, ohne Kreditkarte. Mehr im Profil.</Body>
  </Scene>
);

export const LeereKasse: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: WHITE }}>
    <Series>
      <Series.Sequence durationInFrames={SCENES[0]}>
        <Hook />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[1]}>
        <Reveal />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[2]}>
        <Fill />
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
