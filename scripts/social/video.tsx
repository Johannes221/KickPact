import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { ImageResponse } from "next/og";
import { BODY, DISPLAY, FONTS, LOGO_RATIO, VERTICAL, photo, typo, type PhotoName } from "./brand";
import { SPOTS, type Beat, type Spot } from "./spots";
import { Backdrop, Kicker, PactCards, headlineSize, tone } from "./layout";

/**
 * Rendert die Reels aus SPOTS nach `out/social/reels/<slug>.mp4`.
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
 */

(globalThis as { React?: typeof React }).React = React;

const FPS = 30;
const PAD = 96;
const CONTENT_WIDTH = VERTICAL.width - 2 * PAD;

/* -------------------------------- Inhalte --------------------------------- */

/* ------------------------------- Animation -------------------------------- */

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** Schnell rein, weich aus. Linear sieht nach Powerpoint aus. */
const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

const ENTER_SEC = 0.42;
/** Elemente laufen versetzt ein, sonst springt der Block als Klotz. */
const STAGGER_SEC = 0.09;

/** Einblendung eines Elements: Position im Beat (s) → Versatz + Deckkraft. */
function enter(tSec: number, order: number) {
  const p = easeOut((tSec - order * STAGGER_SEC) / ENTER_SEC);
  return { opacity: p, transform: `translateY(${(1 - p) * 34}px)` };
}

function Frame({ beat, tSec, progress }: { beat: Beat; tSec: number; progress: number }) {
  const t = tone(beat.tone);
  const hasPacts = Boolean(beat.pacts?.length);
  let order = 0;

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
      <Backdrop tone={t} photo={beat.photo ? photo(beat.photo) : null} size={VERTICAL} />

      {beat.logo && (
        <div style={{ display: "flex", marginBottom: 40, ...enter(tSec, order++) }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.logo} width={560} height={Math.round(560 / LOGO_RATIO)} alt="KickPact" />
        </div>
      )}

      {beat.kicker && (
        <div style={{ display: "flex", ...enter(tSec, order++) }}>
          <Kicker text={beat.kicker} tone={t} />
        </div>
      )}

      <div
        style={{
          maxWidth: CONTENT_WIDTH,
          fontFamily: DISPLAY,
          fontSize: headlineSize(beat.headline, hasPacts ? 78 : 104, CONTENT_WIDTH),
          fontWeight: 900,
          color: t.ink,
          letterSpacing: "-0.02em",
          lineHeight: 1.04,
          ...enter(tSec, order++)
        }}
      >
        {typo(beat.headline)}
      </div>

      {beat.body && (
        <div
          style={{
            maxWidth: CONTENT_WIDTH - 40,
            fontSize: 40,
            fontWeight: 400,
            color: t.body,
            lineHeight: 1.4,
            marginTop: 32,
            ...enter(tSec, order++)
          }}
        >
          {typo(beat.body)}
        </div>
      )}

      {beat.pacts && (
        <div style={{ display: "flex", ...enter(tSec, order++) }}>
          <PactCards pacts={beat.pacts} tone={t} width={CONTENT_WIDTH} />
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
          background: t.dotOff,
          display: "flex"
        }}
      >
        <div
          style={{ width: `${progress * 100}%`, height: 8, borderRadius: 4, background: t.dot }}
        />
      </div>

      {/*
        Logo dauerhaft OBEN, nicht unten.
        Instagram legt im Reel unten Caption, Username und Buttons über das Video
        und rechts die Aktions-Leiste. Unten links (wo es im Feed-Karussell sitzt)
        wäre es im fertigen Reel verdeckt. Oben liegt nur die Statusleiste.

        Nicht auf Beats, die das Logo schon groß in der Fläche tragen — sonst
        steht es zweimal auf demselben Bild und das liest sich als Fehler.
      */}
      {!beat.logo && (
        <div style={{ position: "absolute", top: PAD + 38, left: PAD, display: "flex" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.logo} width={200} height={Math.round(200 / LOGO_RATIO)} alt="KickPact" />
        </div>
      )}
    </div>
  );
}

/* --------------------------------- Audio ---------------------------------- */

/**
 * Der Klangteppich: derselbe A-Dur-Pad, den das Saison-Wrapped im Produkt spielt
 * (app/.../wrapped/_components/use-ambient-audio.ts).
 *
 * WARUM SYNTHETISIERT UND KEINE MUSIKDATEI: exakt aus dem Grund, den das Wrapped
 * schon dokumentiert — kein Lizenz- oder Copyright-Risiko, kein fremdes Asset im
 * Repo. Ein zugekaufter Track müsste lizenziert, bezahlt und verwaltet werden;
 * ein „irgendwo runtergeladener" wäre eine Abmahnung mit Anlauf. Das hier gehört
 * uns, klingt in jedem Reel gleich und ist damit nebenbei ein Wiedererkennungs-
 * merkmal.
 *
 * Nachgebaut aus dem Wrapped-Pad: A-Dur über zwei Oktaven (A2, C#3, E3, A3),
 * minimal verstimmt für Breite, Lowpass bei 700 Hz, sanfter Ein- und Ausfader.
 * Eine Vereinfachung gegenüber dem Produkt: dort moduliert ein LFO langsam den
 * Filter-Cutoff, das lässt ffmpeg so nicht zu. Über 20 Sekunden hört man den
 * Unterschied nicht, der Pad steht ohnehin fast still.
 *
 * Das ist ein BETT, kein Song. Es soll unter dem Text liegen und nicht auffallen.
 * Wer auf Instagram einen Track aus dem lizenzierten Katalog drüberlegt,
 * überschreibt es einfach.
 */
const PAD_HZ = [109.62, 138.43, 165.0, 220.76];
const PAD_WEIGHTS = [0.5, 0.3, 0.3, 0.3];
/**
 * Leise genug, um nicht aufzufallen, laut genug, um da zu sein: gemessen ~-21 dB
 * Spitze, der uebliche Bereich fuer ein Hintergrundbett ohne Sprecher. Mit dem
 * Wert des Wrapped-Pads (0.05 Master) waere es auf dem Handy unhoerbar gewesen —
 * dort liegt der Pad unter einer bedienten Oberflaeche, hier traegt er allein.
 */
const PAD_GAIN = 0.5;
const FADE = 1.5;

/**
 * ffmpeg-Argumente fuer den Pad. `videoInputs` = wie viele Eingaenge VOR den
 * Sinus-Toenen liegen; die Filter-Labels muessen daran vorbei zaehlen, sonst
 * mischt ffmpeg die Bildsequenz als Audio (real passiert: [0] war das Video).
 */
function padArgs(sec: number, videoInputs: number): string[] {
  const inputs = PAD_HZ.flatMap((hz) => [
    "-f", "lavfi",
    "-i", `sine=frequency=${hz}:duration=${sec.toFixed(3)}`
  ]);
  const fadeOutStart = Math.max(0, sec - FADE);
  // normalize=0: amix würde sonst die Summe durch die Eingangszahl teilen und
  // die Gewichte damit wirkungslos machen.
  const labels = PAD_HZ.map((_, i) => `[${videoInputs + i}]`).join("");
  const filter =
    `${labels}amix=inputs=${PAD_HZ.length}:weights=${PAD_WEIGHTS.join(" ")}:normalize=0,` +
    `lowpass=f=700,volume=${PAD_GAIN},` +
    `afade=t=in:st=0:d=${FADE},afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${FADE}[a]`;
  return [...inputs, "-filter_complex", filter, "-map", "0:v", "-map", "[a]"];
}

/* --------------------------------- Runner --------------------------------- */

const OUT = join(process.cwd(), "out/social/reels");

async function renderSpot(spot: Spot): Promise<{ frames: number; sec: number }> {
  const frameDir = join(OUT, `.frames-${spot.slug}`);
  rmSync(frameDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });

  const totalSec = spot.beats.reduce((a, b) => a + b.sec, 0);
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

  const sec = frame / FPS;

  // yuv420p + High-Profile: ohne das zeigen Instagram und QuickTime das Video
  // schlicht nicht an. faststart zieht den Index nach vorn (Web-Abspielen).
  // Audio als AAC 128k — der Standard, den jede Plattform annimmt.
  execFileSync(
    "ffmpeg",
    [
      "-y", "-loglevel", "error",
      "-framerate", String(FPS),
      "-i", join(frameDir, "%05d.png"),
      ...padArgs(sec, 1),
      "-c:v", "libx264",
      "-profile:v", "high",
      "-pix_fmt", "yuv420p",
      "-crf", "18",
      "-c:a", "aac",
      "-b:a", "128k",
      "-shortest",
      "-movflags", "+faststart",
      join(OUT, `${spot.slug}.mp4`)
    ],
    { stdio: "inherit" }
  );

  rmSync(frameDir, { recursive: true, force: true });
  writeFileSync(join(OUT, `${spot.slug}.caption.txt`), `${spot.caption}\n`, "utf8");

  return { frames: frame, sec };
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

  /*
   * Beim vollen Lauf die Waisen wegräumen: MP4s und Captions von Spots, die es
   * nicht mehr gibt (umbenannt oder gestrichen).
   *
   * Dieselbe Regel wie in render.tsx, und aus demselben Grund: nach dem Umbau
   * lagen die alten Reels weiter neben den neuen im Ordner. Wer den aufmacht,
   * sieht sechs Videos statt drei und lädt irgendwann eins hoch, das eine
   * Positionierung bewirbt, die wir nicht mehr fahren. Ein Content-Ordner muss
   * zeigen, was JETZT gilt.
   *
   * Nur beim vollen Lauf, weil nur der weiß, welche Spots es überhaupt gibt.
   */
  if (!filter.length) {
    const gueltig = new Set(SPOTS.flatMap((s) => [`${s.slug}.mp4`, `${s.slug}.caption.txt`]));
    for (const eintrag of readdirSync(OUT, { withFileTypes: true })) {
      // .frames-* sind Arbeitsordner eines laufenden Renders, die räumt renderSpot selbst.
      if (eintrag.isFile() && !gueltig.has(eintrag.name)) {
        rmSync(join(OUT, eintrag.name), { force: true });
        console.log(`  ${eintrag.name.padEnd(30)} verwaist, entfernt`);
      }
    }
  }

  for (const spot of spots) {
    const started = Date.now();
    const { frames, sec } = await renderSpot(spot);
    const took = Math.round((Date.now() - started) / 1000);
    console.log(
      `  ${spot.slug.padEnd(30)} ${sec.toFixed(1)}s · ${frames} Frames · ${took}s Render`
    );
  }

  console.log(`\n${spots.length} MP4 → out/social/reels/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
