import React from "react";
import { AbsoluteFill, Series, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Airplane, ArrowsClockwise, Shield, SoccerBall, Sparkle, Trophy } from "@phosphor-icons/react";
import { appShot, LOGO_LIGHT, LOGO_WHITE, NAVY, OFF_WHITE, photoSrc, WHITE } from "./theme";
import {
  Body,
  Headline,
  Kicker,
  Logo,
  PactChip,
  PhIcon,
  PhoneFrame,
  PhotoScene,
  Progress,
  RollingBall,
  Scene
} from "./kit";

/**
 * Reel „Was ihr festlegen könnt" (Features) — 24 Pact-Typen, von „pro Tor" bis
 * „Tor hinter der Mittellinie". Volle Screens: Pact-Karten fliegen gestaffelt
 * rein, am Ende die echte App im iPhone. Copy/Beträge aus spots.ts (Defaults
 * aus TRIGGER_LIBRARY), nichts erfunden.
 */

export const SCENES = [72, 90, 108, 108, 108, 108, 108, 90] as const;
export const DURATION = SCENES.reduce((a, b) => a + b, 0);

const PactGroup: React.FC<{
  kicker: string;
  headline: string;
  pacts: { label: string; amount: string; icon?: PhIcon }[];
}> = ({ kicker, headline, pacts }) => (
  <Scene bg={WHITE}>
    <Kicker text={kicker} delay={2} />
    <Headline size={80} delay={6}>
      {headline}
    </Headline>
    <div style={{ marginTop: 52 }}>
      {pacts.map((p, i) => (
        <PactChip key={p.label} label={p.label} amount={p.amount} icon={p.icon} index={i} />
      ))}
    </div>
  </Scene>
);

const Intro: React.FC = () => (
  <Scene bg={NAVY}>
    <RollingBall y={1360} />
    <div style={{ marginBottom: 44 }}>
      <Logo src={LOGO_WHITE} width={520} delay={4} />
    </div>
    <Headline color={WHITE} size={98} delay={10}>
      Wofür würdet ihr euch bezahlen lassen?
    </Headline>
  </Scene>
);

const PhoneScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame: frame - 8, fps, config: { damping: 16, mass: 0.9 } });
  const settled = Math.min(1, enter);
  return (
    <Scene bg={OFF_WHITE}>
      <div style={{ marginBottom: 36 }}>
        <Kicker text="So stellt ihr's ein" delay={2} />
        <Headline size={80} delay={6}>
          Angetippt, festgelegt, fertig.
        </Headline>
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <PhoneFrame width={500} settled={settled} frame={frame} fps={fps}>
          <img
            src={appShot("sponsor-dashboard")}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
          />
        </PhoneFrame>
      </div>
    </Scene>
  );
};

const CTA: React.FC = () => (
  <Scene bg={WHITE}>
    <RollingBall y={1380} size={130} />
    <div style={{ marginBottom: 40 }}>
      <Logo src={LOGO_LIGHT} width={480} delay={2} />
    </div>
    <Kicker text="24 Pact-Typen" delay={6} />
    <Headline size={84} delay={10}>
      Ihr legt fest, was zählt.
    </Headline>
    <Body delay={20}>Ab 4,99 € pro Mannschaft. 30 Tage kostenlos testen. Link in Bio.</Body>
  </Scene>
);

export const WasFestlegen: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: WHITE }}>
    <Series>
      <Series.Sequence durationInFrames={SCENES[0]}>
        <Intro />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[1]}>
        <PhotoScene
          src={photoSrc("team-green")}
          kicker="Die Idee dahinter"
          headline="Jemand zahlt euch pro Ereignis. Ihr legt fest, welche."
        />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[2]}>
        <PactGroup
          kicker="Die Klassiker"
          headline="Tore und Siege."
          pacts={[
            { label: "Pro Tor", amount: "5 €", icon: SoccerBall },
            { label: "Pro Sieg", amount: "10 €", icon: Trophy },
            { label: "Pro Auswärtssieg", amount: "15 €", icon: Airplane }
          ]}
        />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[3]}>
        <PactGroup
          kicker="Für hinten"
          headline="Auch die Null wird bezahlt."
          pacts={[
            { label: "Pro Zu-Null-Sieg", amount: "5 €", icon: Shield },
            { label: "Pro Comeback-Sieg", amount: "20 €", icon: ArrowsClockwise }
          ]}
        />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[4]}>
        <PactGroup
          kicker="Für die Kunststücke"
          headline="Das Ding aus 50 Metern."
          pacts={[
            { label: "Kopfballtor", amount: "10 €", icon: Sparkle },
            { label: "Hackentor", amount: "15 €", icon: Sparkle },
            { label: "Tor hinter Mittellinie", amount: "25 €", icon: Sparkle }
          ]}
        />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[5]}>
        <PactGroup
          kicker="Für die ganze Saison"
          headline="Das Große kommt am Ende."
          pacts={[
            { label: "Klassenerhalt", amount: "100 €", icon: Shield },
            { label: "Aufstieg", amount: "200 €", icon: Airplane },
            { label: "Meistertitel", amount: "300 €", icon: Trophy }
          ]}
        />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[6]}>
        <PhoneScene />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[7]}>
        <CTA />
      </Series.Sequence>
    </Series>
    <Progress total={DURATION} />
  </AbsoluteFill>
);
