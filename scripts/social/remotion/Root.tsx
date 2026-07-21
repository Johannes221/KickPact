import React from "react";
import { Composition } from "remotion";
import "./fonts";
import { DURATION, Reel } from "./Reel";
import { DURATION as SPONSOR_DUR, WerSponsert } from "./WerSponsert";
import { DURATION as FESTLEGEN_DUR, WasFestlegen } from "./WasFestlegen";
import { DURATION as SPIEL_DUR, SpielAnkuendigen } from "./SpielAnkuendigen";

/**
 * Die registrierten Reels — je eine Composition, alle 1080×1920, 30 fps, stumm
 * (Ton macht Johannes in der App, die API kann keine Katalog-Musik, s. video.tsx).
 * Die Composition-ID = der Reel-Slug ohne Nummer, damit das Render-Skript sie
 * per Slug findet (scripts/social/reel.ts).
 */
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="wrapped" component={Reel} durationInFrames={DURATION} fps={30} width={1080} height={1920} />
    <Composition
      id="wer-sponsert-euch"
      component={WerSponsert}
      durationInFrames={SPONSOR_DUR}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="was-ihr-festlegen-koennt"
      component={WasFestlegen}
      durationInFrames={FESTLEGEN_DUR}
      fps={30}
      width={1080}
      height={1920}
    />
    <Composition
      id="spiel-ankuendigen"
      component={SpielAnkuendigen}
      durationInFrames={SPIEL_DUR}
      fps={30}
      width={1080}
      height={1920}
    />
  </>
);
