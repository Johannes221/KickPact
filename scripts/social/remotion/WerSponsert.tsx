import React from "react";
import { AbsoluteFill, Series, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Coins, HandHeart, SoccerBall, Trophy, Users, UsersThree } from "@phosphor-icons/react";
import { GREEN, GREEN_DARK, LOGO_LIGHT, LOGO_WHITE, NAVY, OFF_WHITE, photoSrc, WHITE } from "./theme";
import {
  Body,
  Headline,
  Kicker,
  Logo,
  MoneyCounter,
  PactChip,
  PhIcon,
  PhotoScene,
  Progress,
  RollingBall,
  Scene,
  useEnter
} from "./kit";

/**
 * Reel „Wer sponsert euch" (Kasse) — im Motion-Look des Wrapped-Reels, getextet
 * für KALTE Viewer (Memory feedback_reel_motion_style): Frage-Hook → Produkt-
 * Reveal (grob, macht neugierig) → wer mitmacht → Kasse füllt sich → Payoff.
 * Kern-These bleibt: nicht Firmen, sondern die Leute, die eh an der Linie stehen.
 */

export const SCENES = [78, 120, 96, 126, 120, 84, 96] as const;
export const DURATION = SCENES.reduce((a, b) => a + b, 0);

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

/** Kalter Hook: eine Frage, die jeder Amateurverein sofort versteht. */
const Hook: React.FC = () => (
  <Scene bg={NAVY}>
    <RollingBall y={1360} />
    <div style={{ marginBottom: 44 }}>
      <Logo src={LOGO_WHITE} width={480} delay={4} />
    </div>
    <Headline color={WHITE} size={92} delay={10}>
      Wer zahlt eigentlich eure Bälle, Trikots und Schiris?
    </Headline>
  </Scene>
);

/** Reveal ~5 Sek rein: grob, was KickPact ist — zwei Pact-Karten fliegen rein. */
const Reveal: React.FC = () => (
  <Scene bg={WHITE}>
    <Kicker text="Die Idee dahinter" delay={2} />
    <Headline size={86} delay={6}>
      Geld pro Tor. Pro Sieg.
    </Headline>
    <div style={{ marginTop: 44 }}>
      <PactChip label="Pro Tor" amount="5 €" icon={SoccerBall} index={0} />
      <PactChip label="Pro Sieg" amount="10 €" icon={Trophy} index={1} />
    </div>
    <Body delay={40}>Jemand verspricht den Betrag. Ihr spielt, die Kasse füllt sich von allein.</Body>
  </Scene>
);

const RightPeople: React.FC = () => (
  <Scene bg={WHITE}>
    <Kicker text="Und wer macht das?" delay={2} />
    <Headline size={82} delay={6}>
      Nicht das Autohaus. Die Leute an der Linie.
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
    <Body delay={18}>30 Tage kostenlos, ohne Kreditkarte. Jetzt loslegen: kickpact.com</Body>
  </Scene>
);

export const WerSponsert: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: WHITE }}>
    <Series>
      <Series.Sequence durationInFrames={SCENES[0]}>
        <Hook />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[1]}>
        <Reveal />
      </Series.Sequence>
      <Series.Sequence durationInFrames={SCENES[2]}>
        <PhotoScene
          src={photoSrc("team-celebration")}
          kicker="Die stehen eh jedes Wochenende da"
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
