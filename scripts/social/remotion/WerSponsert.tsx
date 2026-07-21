import React from "react";
import { AbsoluteFill, interpolate, Series, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Coins, HandHeart, Users, UsersThree } from "@phosphor-icons/react";
import { GREEN, GREEN_DARK, LOGO_LIGHT, LOGO_WHITE, NAVY, OFF_WHITE, photoSrc, WHITE } from "./theme";
import {
  Body,
  Headline,
  Kicker,
  Logo,
  MoneyCounter,
  PhotoScene,
  PhIcon,
  Progress,
  RollingBall,
  Scene,
  useEnter
} from "./kit";

/**
 * Reel „Wer sponsert euch" (Kasse) — im Motion-Look des Wrapped-Reels.
 * Kern-These: Vereine fragen Firmen (Autohaus, Bäcker) und übersehen die Leute,
 * die eh jedes Wochenende an der Linie stehen (Eltern, Ehemalige, der Onkel).
 * Copy nah an spots.ts (abgesegnet), aber als volle, bewegte Screens.
 */

export const SCENES = [72, 132, 96, 126, 120, 84, 96] as const;
export const DURATION = SCENES.reduce((a, b) => a + b, 0);

/** Eine „Firma", die durchgestrichen wird — die falschen Sponsoren. */
const RejectTile: React.FC<{ label: string; index: number }> = ({ label, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inDelay = 12 + index * 10;
  const s = spring({ frame: frame - inDelay, fps, config: { damping: 15, mass: 0.7 } });
  const settled = Math.min(1, Math.max(0, s));
  // Durchstreichen erst NACHDEM die Kachel steht.
  const strike = interpolate(frame, [inDelay + 22, inDelay + 34], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 24,
        width: "100%",
        background: WHITE,
        border: `2px solid ${OFF_WHITE}`,
        borderRadius: 28,
        padding: "30px 34px",
        marginBottom: 22,
        opacity: settled * (1 - strike * 0.42),
        transform: `translateX(${(1 - s) * 90}px)`
      }}
    >
      <div style={{ flex: 1, fontSize: 50, fontWeight: 700, color: NAVY }}>{label}</div>
      <div style={{ fontSize: 44, fontWeight: 800, color: "#D64541" }}>Absage</div>
      <div
        style={{
          position: "absolute",
          left: 34,
          right: 34,
          top: "50%",
          height: 8,
          borderRadius: 4,
          background: "#D64541",
          transformOrigin: "left center",
          transform: `scaleX(${strike})`
        }}
      />
    </div>
  );
};

/** Eine „richtige" Gruppe — Icon-Kachel, die aufpoppt. */
const PeopleTile: React.FC<{ icon: PhIcon; label: string; index: number }> = ({
  icon: Icon,
  label,
  index
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const delay = 14 + index * 10;
  const pop = spring({ frame: frame - delay, fps, config: { damping: 13, mass: 0.7 } });
  return (
    <div
      style={{
        flex: 1,
        background: OFF_WHITE,
        borderRadius: 30,
        padding: "44px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 20,
        opacity: Math.min(1, pop),
        transform: `scale(${0.8 + 0.2 * Math.min(1, pop)})`
      }}
    >
      <Icon size={92} weight="duotone" color={GREEN_DARK} />
      <div style={{ fontSize: 40, fontWeight: 700, color: NAVY, textAlign: "center" }}>{label}</div>
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
      Ihr fragt die Falschen.
    </Headline>
  </Scene>
);

const WrongList: React.FC = () => (
  <Scene bg={WHITE}>
    <Kicker text="Der übliche Weg" delay={2} />
    <Headline size={78} delay={6}>
      Autohaus. Bäcker. Getränkemarkt.
    </Headline>
    <div style={{ marginTop: 48 }}>
      <RejectTile label="Autohaus" index={0} />
      <RejectTile label="Getränkemarkt" index={1} />
      <RejectTile label="Bäckerei" index={2} />
    </div>
  </Scene>
);

const RightPeople: React.FC = () => (
  <Scene bg={WHITE}>
    <Kicker text="Dabei stehen die Richtigen längst da" delay={2} />
    <Headline size={80} delay={6}>
      Privatleute. Keine Firmen.
    </Headline>
    <div style={{ display: "flex", gap: 24, marginTop: 56 }}>
      <PeopleTile icon={Users} label="Eltern" index={0} />
      <PeopleTile icon={UsersThree} label="Ehemalige" index={1} />
      <PeopleTile icon={HandHeart} label="Der Onkel" index={2} />
    </div>
  </Scene>
);

const Kasse: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <Scene bg={NAVY}>
      <div style={{ position: "absolute", top: 220, left: 0, right: 0, display: "flex", justifyContent: "center", ...useEnter(2) }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Coins size={40} weight="duotone" color={GREEN} />
          <div style={{ fontSize: 32, fontWeight: 700, color: GREEN, letterSpacing: "0.14em", textTransform: "uppercase" }}>
            5 € pro Tor · 10 € pro Sieg
          </div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <MoneyCounter target={240} label="in eurer Mannschaftskasse, diese Saison" delay={10} />
      </div>
      <div style={{ position: "absolute", bottom: 220, left: 96, right: 96, textAlign: "center", opacity: Math.min(1, Math.max(0, (frame - 60) / 20)) }}>
        <div style={{ fontSize: 40, color: "rgba(255,255,255,0.7)" }}>Viele kleine Pacts. Eine volle Kasse.</div>
      </div>
    </Scene>
  );
};

const Payoff: React.FC = () => (
  <Scene bg={WHITE}>
    <Kicker text="Warum sie mitmachen" delay={2} />
    <Headline size={90} delay={8}>
      Sie wollen kein Logo am Zaun.
    </Headline>
    <Headline size={90} color={GREEN_DARK} delay={16}>
      Sie wollen dabei sein.
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
      Startet eure Mannschaftskasse.
    </Headline>
    <Body delay={18}>Ab 4,99 € im Monat pro Mannschaft. 30 Tage kostenlos. kickpact.com</Body>
  </Scene>
);

export const WerSponsert: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: WHITE }}>
    <Series>
      <Series.Sequence durationInFrames={SCENES[0]}>
        <Intro />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[1]}>
        <WrongList />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[2]}>
        <PhotoScene
          src={photoSrc("team-celebration")}
          kicker="Jeden Samstag an der Linie"
          headline="Bei 3 Grad. Freiwillig."
        />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[3]}>
        <RightPeople />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[4]}>
        <Kasse />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[5]}>
        <Payoff />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[6]}>
        <CTA />
      </Series.Sequence>
    </Series>
    <Progress total={DURATION} />
  </AbsoluteFill>
);
