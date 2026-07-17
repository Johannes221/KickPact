import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { ImageResponse } from "next/og";
import type { Tone } from "./decks";
import {
  BODY,
  DISPLAY,
  FONTS,
  GREEN,
  GREEN_DARK,
  LOGO_ON_GREEN,
  LOGO_ON_LIGHT,
  LOGO_RATIO,
  NAVY,
  ON_GREEN,
  typo,
  VERTICAL,
  WHITE
} from "./brand";

/**
 * Rendert die Reels aus SPOTS nach `out/social/video/<slug>.mp4`.
 *
 *   npm run social:video           alle Spots
 *   npm run social:video -- 02     nur Spots, deren Slug „02" enthält
 *
 * Warum kein Remotion: wir rendern Motive längst mit Satori (render.tsx), und
 * ffmpeg liegt auf der Maschine. Damit ist ein Reel „viele PNGs plus ein
 * ffmpeg-Aufruf" und braucht keine zweite Render-Engine im Projekt, die ihre
 * eigene React-Version, ihren eigenen Font-Pfad und ihr eigenes Bundling
 * mitbringt. Sobald ein Spot echtes Video, Masken oder Audio-Sync braucht, ist
 * Remotion die richtige Antwort. Für Text-on-Motion ist es Overkill.
 *
 * OHNE TONSPUR, und zwar mit Absicht: Musik wird in Instagram bzw. TikTok selbst
 * druntergelegt. Nur dort greift der lizenzierte Katalog des Business-Accounts.
 * Ein hier einmontierter Track wäre nicht abgedeckt und würde stummgeschaltet.
 */

(globalThis as { React?: typeof React }).React = React;

const FPS = 30;
const PAD = 96;
const CONTENT_WIDTH = VERTICAL.width - 2 * PAD;

/* -------------------------------- Inhalte --------------------------------- */

interface Beat {
  kicker?: string;
  headline: string;
  body?: string;
  tone?: Tone;
  /** Standzeit in Sekunden, inklusive Einblendung. */
  sec: number;
}

interface Spot {
  slug: string;
  /** Kurzbeschreibung fürs Log. Nur Doku. */
  angle: string;
  caption: string;
  beats: Beat[];
}

/**
 * Lesezeit ist die Grenze, nicht der Geschmack: bei ~3 Wörtern pro Sekunde
 * braucht eine Headline mit Body real 2,5 bis 3 Sekunden, sonst wischt der
 * Daumen weiter, bevor der Satz angekommen ist. Deshalb sitzt kein Beat unter
 * 2,2s, auch wenn er kurz aussieht.
 */
export const SPOTS: Spot[] = [
  {
    slug: "01-so-funktioniert",
    angle: "Erklärung",
    caption:
      "Sponsoring im Amateurfußball heißt bisher: einmal im Jahr 300 Euro, dafür " +
      "ein Logo auf einem Banner, das keiner liest.\n\n" +
      "KickPact dreht das um.\n\nkickpact.com",
    beats: [
      { headline: "So funktioniert KickPact.", tone: "green", sec: 2.4 },
      {
        kicker: "Schritt 1",
        headline: "Jemand verspricht 5 € pro Tor.",
        body: "Eltern, Ehemalige, der Onkel, der eh jedes Spiel schaut.",
        sec: 3.2
      },
      {
        kicker: "Schritt 2",
        headline: "Ihr spielt einfach.",
        body: "Die Spieldaten holt sich die App selbst. Ihr tragt nichts ein.",
        sec: 3.2
      },
      {
        kicker: "Schritt 3",
        headline: "Jedes Tor zählt sich selbst.",
        body: "Tor, Sieg, Spiel ohne Gegentor. Ihr legt fest, was zählt.",
        sec: 3.2
      },
      { headline: "3 Tore. 15 € in der Kasse.", tone: "green", sec: 2.6 },
      {
        kicker: "Am Monatsende",
        headline: "Rechnung raus, Geld an den Verein.",
        body: "Wir behalten davon nichts ein.",
        sec: 3.0
      },
      {
        kicker: "kickpact.com",
        headline: "19,99 € im Monat.",
        body: "Für den ganzen Verein. 30 Tage testen.",
        tone: "green",
        sec: 3.2
      }
    ]
  },

  {
    slug: "02-fuenf-euro-pro-tor",
    angle: "Ansporn",
    caption:
      "88. Minute, ihr führt 3:1, und normalerweise schiebt jetzt nur noch jeder.\n\n" +
      "kickpact.com",
    beats: [
      { kicker: "88. Minute", headline: "Ihr führt 3:1.", sec: 2.4 },
      { headline: "Normalerweise schiebt jetzt nur noch jeder.", sec: 2.6 },
      { headline: "Außer es hängen 5 € pro Tor drin.", tone: "green", sec: 2.8 },
      {
        headline: "Dann läuft der Innenverteidiger mit nach vorne.",
        body: "Und der Trainer muss in der Halbzeit niemanden mehr anschreien.",
        sec: 3.4
      },
      {
        kicker: "kickpact.com",
        headline: "Macht die Mannschaftskasse voll.",
        tone: "green",
        sec: 2.8
      }
    ]
  },

  {
    slug: "03-kein-banner-mehr",
    angle: "Kein Klinkenputzen",
    caption:
      "Ein Banner am Zaun kostet den Sponsor 300 Euro im Jahr und bringt ihm nichts, " +
      "was er messen könnte. Deshalb sagt er beim zweiten Mal ab.\n\n" +
      "kickpact.com",
    beats: [
      { kicker: "Der alte Weg", headline: "300 € im Jahr. Einmal.", sec: 2.4 },
      {
        headline: "Dafür hängt sein Logo am Zaun.",
        body: "Und wird von niemandem gelesen.",
        sec: 3.0
      },
      { headline: "Beim zweiten Mal sagt er ab.", sec: 2.4 },
      { headline: "Geht auch anders.", tone: "green", sec: 2.2 },
      {
        headline: "Er verspricht 5 € pro Tor.",
        body: "Und schaut auf einmal jedes Spiel, weil es um seine Kohle geht.",
        sec: 3.4
      },
      { kicker: "kickpact.com", headline: "30 Tage testen.", tone: "green", sec: 2.6 }
    ]
  }
];

/* -------------------------------- Tonarten -------------------------------- */

const TONES: Record<
  Tone,
  { bg: string; ink: string; kicker: string; body: string; logo: string; bar: string; barBg: string }
> = {
  light: {
    bg: WHITE,
    ink: NAVY,
    kicker: GREEN_DARK,
    body: "rgba(26,26,46,0.66)",
    logo: LOGO_ON_LIGHT,
    bar: GREEN,
    barBg: "rgba(26,26,46,0.12)"
  },
  green: {
    bg: GREEN,
    ink: ON_GREEN,
    kicker: "rgba(26,26,46,0.68)",
    body: "rgba(26,26,46,0.78)",
    logo: LOGO_ON_GREEN,
    bar: NAVY,
    barBg: "rgba(26,26,46,0.22)"
  }
};

/* ------------------------------- Animation -------------------------------- */

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** Schnell rein, weich aus. Linear sieht nach Powerpoint aus. */
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

const ENTER_SEC = 0.42;
/** Kicker, Headline und Body laufen versetzt ein, sonst springt der Block als Klotz. */
const STAGGER_SEC = 0.09;

/** Einblendung eines Elements: Position im Beat (s) → Versatz + Deckkraft. */
function enter(tSec: number, order: number) {
  const p = easeOut((tSec - order * STAGGER_SEC) / ENTER_SEC);
  return { opacity: p, transform: `translateY(${(1 - p) * 34}px)` };
}

function Frame({ beat, tSec, progress }: { beat: Beat; tSec: number; progress: number }) {
  const t = TONES[beat.tone ?? "light"];
  return (
    <div
      style={{
        width: VERTICAL.width,
        height: VERTICAL.height,
        background: t.bg,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        fontFamily: BODY,
        padding: PAD
      }}
    >
      {beat.kicker && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 28,
            ...enter(tSec, 0)
          }}
        >
          <div style={{ width: 30, height: 7, borderRadius: 4, background: t.kicker }} />
          <div
            style={{
              fontSize: 30,
              fontWeight: 700,
              color: t.kicker,
              letterSpacing: "0.16em",
              textTransform: "uppercase"
            }}
          >
            {typo(beat.kicker)}
          </div>
        </div>
      )}

      <div
        style={{
          maxWidth: CONTENT_WIDTH,
          fontFamily: DISPLAY,
          fontSize: headlineSize(beat.headline),
          fontWeight: 900,
          color: t.ink,
          letterSpacing: "-0.02em",
          lineHeight: 1.04,
          ...enter(tSec, beat.kicker ? 1 : 0)
        }}
      >
        {typo(beat.headline)}
      </div>

      {beat.body && (
        <div
          style={{
            maxWidth: CONTENT_WIDTH - 40,
            fontSize: 42,
            fontWeight: 400,
            color: t.body,
            lineHeight: 1.4,
            marginTop: 36,
            ...enter(tSec, beat.kicker ? 2 : 1)
          }}
        >
          {typo(beat.body)}
        </div>
      )}

      {/* Fortschritt über den GANZEN Spot. Zeigt dem Daumen, dass gleich Schluss
          ist — der stärkste Hebel gegen Wegwischen in der Mitte. */}
      <div
        style={{
          position: "absolute",
          top: PAD,
          left: PAD,
          right: PAD,
          height: 8,
          borderRadius: 4,
          background: t.barBg,
          display: "flex"
        }}
      >
        <div
          style={{
            width: `${progress * 100}%`,
            height: 8,
            borderRadius: 4,
            background: t.bar
          }}
        />
      </div>

      {/*
        Logo OBEN, nicht unten.
        Instagram legt im Reel unten Caption, Username und Buttons über das Video
        und rechts die Aktions-Leiste. Unten links (der naheliegende Platz, und
        wo es im Feed-Karussell auch sitzt) war es damit im fertigen Reel
        verdeckt. Oben liegt nur die Statusleiste, das ist die sicherste Fläche.
        Deshalb hat das Karussell sein Logo unten und das Reel oben: verschiedene
        Flächen, verschiedene Regeln.
      */}
      <div style={{ position: "absolute", top: PAD + 40, left: PAD, display: "flex" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={t.logo} width={200} height={Math.round(200 / LOGO_RATIO)} alt="KickPact" />
      </div>
    </div>
  );
}

/** Montserrat Alternates Black läuft breit — kleinere Stufen als bei Inter. */
function headlineSize(text: string): number {
  if (text.length <= 24) return 104;
  if (text.length <= 44) return 84;
  return 68;
}

/* --------------------------------- Runner --------------------------------- */

const OUT = join(process.cwd(), "out/social/video");

async function renderSpot(spot: Spot): Promise<{ frames: number; sec: number }> {
  const frameDir = join(OUT, `.frames-${spot.slug}`);
  rmSync(frameDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });

  const totalSec = spot.beats.reduce((a, b) => a + b.sec, 0);
  const totalFrames = Math.round(totalSec * FPS);

  let frame = 0;
  let elapsed = 0;

  for (const beat of spot.beats) {
    const beatFrames = Math.round(beat.sec * FPS);
    for (let i = 0; i < beatFrames; i++) {
      const res = new ImageResponse(
        <Frame beat={beat} tSec={i / FPS} progress={(elapsed + i / FPS) / totalSec} />,
        { ...VERTICAL, fonts: FONTS }
      );
      writeFileSync(
        join(frameDir, `${String(frame).padStart(5, "0")}.png`),
        Buffer.from(await res.arrayBuffer())
      );
      frame++;
    }
    elapsed += beat.sec;
  }

  // yuv420p + High-Profile: ohne das zeigen Instagram und QuickTime das Video
  // schlicht nicht an. faststart zieht den Index nach vorn (Web-Abspielen).
  execFileSync(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-framerate", String(FPS),
      "-i", join(frameDir, "%05d.png"),
      "-c:v", "libx264",
      "-profile:v", "high",
      "-pix_fmt", "yuv420p",
      "-crf", "18",
      "-movflags", "+faststart",
      join(OUT, `${spot.slug}.mp4`)
    ],
    { stdio: "inherit" }
  );

  rmSync(frameDir, { recursive: true, force: true });
  writeFileSync(join(OUT, `${spot.slug}.caption.txt`), `${spot.caption}\n`, "utf8");

  return { frames: totalFrames, sec: totalSec };
}

async function main() {
  const filter = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const spots = filter.length
    ? SPOTS.filter((s) => filter.some((f) => s.slug.includes(f)))
    : SPOTS;

  if (!spots.length) {
    console.error(`Kein Spot passt auf "${filter.join(" ")}".`);
    console.error(`Vorhanden: ${SPOTS.map((s) => s.slug).join(", ")}`);
    process.exit(1);
  }

  mkdirSync(OUT, { recursive: true });

  for (const spot of spots) {
    const started = Date.now();
    const { frames, sec } = await renderSpot(spot);
    const took = Math.round((Date.now() - started) / 1000);
    console.log(`  ${spot.slug.padEnd(24)} ${sec.toFixed(1)}s · ${frames} Frames · ${took}s Render`);
  }

  console.log(`\n${spots.length} MP4 → out/social/video/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
