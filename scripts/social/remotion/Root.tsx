import React from "react";
import { Composition } from "remotion";
import "./fonts";
import { DURATION, Reel } from "./Reel";

/**
 * Die registrierten Compositions. Aktuell nur der Wrapped-Reel als Beweis des
 * Looks; sobald der sitzt, kommen die übrigen Spots als weitere Compositions
 * (oder als eine parametrisierte, per input-props gewählte) dazu.
 *
 * 1080×1920, 30 fps, stumm — wie die Satori-Reels. Ton macht Johannes in der App
 * (die API kann keine Katalog-Musik, s. video.tsx).
 */
export const RemotionRoot: React.FC = () => (
  <Composition
    id="wrapped"
    component={Reel}
    durationInFrames={DURATION}
    fps={30}
    width={1080}
    height={1920}
  />
);
