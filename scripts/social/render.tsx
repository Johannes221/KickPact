import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { ImageResponse } from "next/og";
import { DECKS, type Deck, type Slide, type Tone } from "./decks";
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
  SLIDE_SIZE,
  typo,
  WHITE
} from "./brand";

/**
 * Rendert die Karussell-Posts aus `decks.ts` nach `out/social/`.
 *
 *   npm run social:render            alle Decks
 *   npm run social:render -- 02      nur Decks, deren Slug „02" enthält
 *
 * Warum im Repo und nicht in Canva: die Motive der App sind schon React
 * (lib/story/story-card.tsx). Ein zweiter, handgepflegter Satz Vorlagen in einem
 * Design-Tool driftet garantiert weg. Hier teilen sich Post und Produkt dieselbe
 * Palette (scripts/social/brand.ts) und dieselben Schriftdateien.
 */

/**
 * tsx (4.19) transformt JSX immer klassisch nach `React.createElement` und
 * ignoriert `jsx` aus der tsconfig — mit `--tsconfig jsx:"react-jsx"` gemessen,
 * ändert nichts. Ohne React im globalen Scope wirft jede Komponente hier.
 */
(globalThis as { React?: typeof React }).React = React;

const PAD = 88;
const CONTENT_WIDTH = SLIDE_SIZE.width - 2 * PAD;

/* -------------------------------- Tonarten -------------------------------- */

/**
 * Die zwei Flächen der CI. Ein Objekt statt verstreuter Ternaries: jede Farbe
 * einer Tonart steht an einer Stelle, und ein neuer Slide-Typ ist ein Eintrag,
 * kein Refactoring.
 *
 * Kontrast ist hier die ganze Arbeit, nicht Deko — siehe brand.ts:
 * grüner Text nur als GREEN_DARK, grüne Fläche nur mit Navy-Text.
 */
const TONES: Record<
  Tone,
  { bg: string; ink: string; kicker: string; body: string; logo: string; dot: string; dotOff: string }
> = {
  light: {
    bg: WHITE,
    ink: NAVY,
    kicker: GREEN_DARK,
    body: "rgba(26,26,46,0.66)",
    logo: LOGO_ON_LIGHT,
    dot: GREEN,
    dotOff: "rgba(26,26,46,0.16)"
  },
  green: {
    bg: GREEN,
    ink: ON_GREEN,
    kicker: "rgba(26,26,46,0.68)",
    body: "rgba(26,26,46,0.78)",
    logo: LOGO_ON_GREEN,
    dot: NAVY,
    dotOff: "rgba(26,26,46,0.28)"
  }
};

/* ------------------------------- Karussell -------------------------------- */

/**
 * Ein Karussell-Slide.
 *
 * Kein `display: "flex"` auf den Textblöcken: in Satori wird ein Text damit zum
 * einzeiligen Flex-Item und läuft rechts raus, statt umzubrechen. Genau dagegen
 * musste story-card.tsx sein `fitFontSize` bauen. Hier brauchen die Headlines
 * echten Umbruch (es sind ganze Sätze), also bleiben die Textblöcke Blöcke und
 * `maxWidth` macht den Umbruch.
 */
function SlideCard({
  slide,
  index,
  total
}: {
  slide: Slide;
  index: number;
  total: number;
}) {
  const t = TONES[slide.tone ?? "light"];
  return (
    <div
      style={{
        width: SLIDE_SIZE.width,
        height: SLIDE_SIZE.height,
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
      {slide.kicker && <Kicker text={slide.kicker} tone={t} />}

      <div
        style={{
          maxWidth: CONTENT_WIDTH,
          fontFamily: DISPLAY,
          fontSize: headlineSize(slide.headline),
          fontWeight: 900,
          color: t.ink,
          letterSpacing: "-0.02em",
          lineHeight: 1.04
        }}
      >
        {typo(slide.headline)}
      </div>

      {slide.body && (
        <div
          style={{
            maxWidth: CONTENT_WIDTH - 40,
            fontSize: 38,
            fontWeight: 400,
            color: t.body,
            lineHeight: 1.42,
            marginTop: 34
          }}
        >
          {typo(slide.body)}
        </div>
      )}

      <Footer tone={t} index={index} total={total} />
    </div>
  );
}

/** Caps-Label mit grünem Merker davor. Der Merker ist die einzige Deko hier. */
function Kicker({ text, tone }: { text: string; tone: (typeof TONES)[Tone] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 26 }}>
      <div style={{ width: 28, height: 6, borderRadius: 3, background: tone.kicker }} />
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: tone.kicker,
          letterSpacing: "0.16em",
          textTransform: "uppercase"
        }}
      >
        {typo(text)}
      </div>
    </div>
  );
}

/**
 * Headline-Größe nach Länge. Satori bricht hier zwar um (s. SlideCard), aber ein
 * Fünfzeiler in 92px erschlägt den Slide. Die Stufen halten die Headline bei etwa
 * drei Zeilen, egal wie lang der Satz ist.
 *
 * Kleiner als in der Inter-Fassung: Montserrat Alternates Black läuft deutlich
 * breiter, gleiche Zeichenzahl braucht mehr Platz.
 */
function headlineSize(text: string): number {
  if (text.length <= 26) return 92;
  if (text.length <= 46) return 74;
  return 60;
}

/** Fortschritt + Logo. Der Punkt-Strip ist der „weiterwischen"-Hinweis. */
function Footer({
  tone,
  index,
  total
}: {
  tone: (typeof TONES)[Tone];
  index: number;
  total: number;
}) {
  const LOGO_W = 190;
  return (
    <div
      style={{
        position: "absolute",
        bottom: PAD,
        left: PAD,
        right: PAD,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}
    >
      <div style={{ display: "flex", gap: 10 }}>
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            style={{
              width: i === index ? 40 : 12,
              height: 12,
              borderRadius: 999,
              background: i === index ? tone.dot : tone.dotOff
            }}
          />
        ))}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={tone.logo} width={LOGO_W} height={Math.round(LOGO_W / LOGO_RATIO)} alt="KickPact" />
    </div>
  );
}

/* --------------------------------- Runner --------------------------------- */

const OUT = join(process.cwd(), "out/social");

async function png(element: React.ReactElement, size: { width: number; height: number }) {
  const res = new ImageResponse(element, { ...size, fonts: FONTS });
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Platzhalter blockieren den Render.
 *
 * `[X]` ist die Konvention aus dem de-webcopy-Skill für „echtes Detail fehlt
 * noch". Ein durchgerutschtes `[X]` im Feed wäre nicht bloß ein Tippfehler,
 * sondern der Beweis, dass den Post nie jemand gelesen hat. Hart abbrechen.
 */
function assertNoPlaceholders(deck: Deck): void {
  const text = [
    deck.caption,
    ...deck.slides.flatMap((s) => [s.kicker ?? "", s.headline, s.body ?? ""])
  ].join(" ");
  const hit = text.match(/\[[A-Za-z0-9_ ]+\]/);
  if (hit) {
    throw new Error(
      `Deck "${deck.slug}" enthält noch den Platzhalter ${hit[0]}. ` +
        `Echtes Detail eintragen oder Deck rausnehmen — nichts erfinden.`
    );
  }
}

async function renderDeck(deck: Deck): Promise<number> {
  assertNoPlaceholders(deck);
  const dir = join(OUT, deck.slug);
  mkdirSync(dir, { recursive: true });

  for (const [i, slide] of deck.slides.entries()) {
    const buf = await png(
      <SlideCard slide={slide} index={i} total={deck.slides.length} />,
      SLIDE_SIZE
    );
    writeFileSync(join(dir, `${String(i + 1).padStart(2, "0")}.png`), buf);
  }

  // Caption + Hashtags als Textdatei daneben: der Post besteht aus beidem, und
  // beim Hochladen will man nicht zwischen zwei Quellen springen.
  writeFileSync(
    join(dir, "caption.txt"),
    `${deck.caption}\n\n${deck.hashtags.join(" ")}\n`,
    "utf8"
  );
  return deck.slides.length;
}

async function main() {
  const filter = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const decks = filter.length
    ? DECKS.filter((d) => filter.some((f) => d.slug.includes(f)))
    : DECKS;

  if (!decks.length) {
    console.error(`Kein Deck passt auf "${filter.join(" ")}".`);
    console.error(`Vorhanden: ${DECKS.map((d) => d.slug).join(", ")}`);
    process.exit(1);
  }

  // Nur die gewählten Decks neu bauen — ein gefilterter Lauf darf die Videos und
  // die anderen Decks nicht mitlöschen.
  for (const deck of decks) rmSync(join(OUT, deck.slug), { recursive: true, force: true });

  /*
   * Beim vollen Lauf zusätzlich die Waisen wegräumen: Ordner von Decks, die es
   * nicht mehr gibt (umbenannt oder gestrichen).
   *
   * Real passiert am 2026-07-17: nach dem Umbau auf die CI standen die fünf
   * alten Decks im alten Navy weiter in out/social/ neben den neuen. Wer den
   * Ordner aufmacht, sieht acht Decks und lädt irgendwann das falsche hoch —
   * und zwar eins, das weder in der CI noch in der richtigen Tonalität ist.
   * Ein Content-Ordner muss zeigen, was JETZT gilt, nicht die Geschichte.
   *
   * Nur beim vollen Lauf, weil nur der weiß, welche Decks es überhaupt gibt.
   */
  if (!filter.length && existsSync(OUT)) {
    const gueltig = new Set([...DECKS.map((d) => d.slug), "video"]);
    for (const eintrag of readdirSync(OUT, { withFileTypes: true })) {
      if (eintrag.isDirectory() && !gueltig.has(eintrag.name)) {
        rmSync(join(OUT, eintrag.name), { recursive: true, force: true });
        console.log(`  ${eintrag.name.padEnd(24)} verwaist, entfernt`);
      }
    }
  }

  let slides = 0;
  for (const deck of decks) {
    slides += await renderDeck(deck);
    console.log(`  ${deck.slug.padEnd(24)} ${deck.slides.length} Slides`);
  }

  console.log(`\n${slides} PNGs → out/social/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
