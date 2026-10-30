import React from "react";
import { AbsoluteFill, Series } from "remotion";
import { HandHeart, Heart, Users, UsersThree } from "@phosphor-icons/react";
import { LOGO_WHITE, NAVY, WHITE } from "./theme";
import { Body, Headline, IconTile, Kicker, Logo, Progress, RollingBall, Scene } from "./kit";

/**
 * Reel „Familie fiebert mit" — die Community-Idee: wenn Freunde und Familie
 * Beträge pro Tor versprechen, fiebert plötzlich die ganze Verwandtschaft mit.
 * Ton: warm + augenzwinkernd (Oma schreit lauter als du). Kalt-tauglich: der
 * Reveal, was KickPact ist, kommt ~5 Sek rein.
 */

export const SCENES = [96, 84, 120, 120, 90] as const;
export const DURATION = SCENES.reduce((a, b) => a + b, 0);

const Hook: React.FC = () => (
  <Scene bg={NAVY}>
    <RollingBall y={1400} size={130} />
    <div style={{ marginBottom: 40 }}>
      <Logo src={LOGO_WHITE} width={460} delay={4} />
    </div>
    <Headline color={WHITE} size={88} delay={10}>
      Stell dir vor, deine Oma schreit bei jedem Tor lauter als du.
    </Headline>
  </Scene>
);

const Why: React.FC = () => (
  <Scene bg={WHITE}>
    <Kicker text="Der Grund?" delay={2} />
    <Headline size={104} delay={8}>
      Sie hat 5 € pro Tor drauf.
    </Headline>
  </Scene>
);

const Reveal: React.FC = () => (
  <Scene bg={WHITE}>
    <Kicker text="So läuft's" delay={2} />
    <Headline size={78} delay={6}>
      Freunde und Familie versprechen Beträge pro Tor. Fürs Team.
    </Headline>
    <Body delay={18}>Ihr spielt, sie fiebern mit, die Mannschaftskasse füllt sich.</Body>
  </Scene>
);

const AllIn: React.FC = () => (
  <Scene bg={WHITE}>
    <Kicker text="Auf einmal sind alle dabei" delay={2} />
    <Headline size={80} delay={6}>
      Nicht nur ihr auf dem Platz.
    </Headline>
    <div style={{ display: "flex", gap: 20, marginTop: 56 }}>
      <IconTile icon={Heart} label="Oma" index={0} />
      <IconTile icon={Users} label="Papa" index={1} />
      <IconTile icon={HandHeart} label="Beste Freundin" index={2} />
      <IconTile icon={UsersThree} label="Der Onkel" index={3} />
    </div>
  </Scene>
);

const CTA: React.FC = () => (
  <Scene bg={NAVY}>
    <RollingBall y={1400} size={130} />
    <div style={{ marginBottom: 40 }}>
      <Logo src={LOGO_WHITE} width={460} delay={2} />
    </div>
    <Headline color={WHITE} size={82} delay={8}>
      Ihr spielt für die halbe Verwandtschaft.
    </Headline>
    <Body color="rgba(255,255,255,0.75)" delay={18}>
      30 Tage kostenlos, ohne Kreditkarte. Mehr im Profil.
    </Body>
  </Scene>
);

export const FamilieFiebert: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: WHITE }}>
    <Series>
      <Series.Sequence durationInFrames={SCENES[0]}>
        <Hook />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[1]}>
        <Why />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[2]}>
        <Reveal />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[3]}>
        <AllIn />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[4]}>
        <CTA />
      </Series.Sequence>
    </Series>
    <Progress total={DURATION} />
  </AbsoluteFill>
);
