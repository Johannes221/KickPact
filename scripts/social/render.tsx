import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { ImageResponse } from "next/og";
import { DECKS, type Deck, type Slide } from "./decks";
import {
  BODY,
  DISPLAY,
  FONTS,
  LOGO_RATIO,
  SLIDE_SIZE,
  photo,
  typo
} from "./brand";
import { Backdrop, Footer, Kicker, PactCards, headlineSize, tone } from "./layout";

/**
 * Rendert die Karussell-Posts aus `decks.ts` nach `out/social/`.
 *
 *   npm run social:render            alle Decks
 *   npm run social:render -- 02      nur Decks, deren Slug „02" enthält
 *
 * Warum im Repo und nicht in Canva: die Motive der App sind schon React
 * (lib/story/story-card.tsx). Ein zweiter, handgepflegter Satz Vorlagen in einem
 * Design-Tool driftet garantiert weg. Hier teilen sich Post und Produkt dieselbe
 * Palette (brand.ts) und dieselben Schriftdateien.
 */

/**
 * tsx (4.19) transformt JSX immer klassisch nach `React.createElement` und
 * ignoriert `jsx` aus der tsconfig — mit `--tsconfig jsx:"react-jsx"` gemessen,
 * ändert nichts. Ohne React im globalen Scope wirft jede Komponente hier.
 */
(globalThis as { React?: typeof React }).React = React;

const PAD = 88;
const CONTENT_WIDTH = SLIDE_SIZE.width - 2 * PAD;

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
  const t = tone(slide.tone);
  const hasPacts = Boolean(slide.pacts?.length);

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
      <Backdrop tone={t} photo={slide.photo ? photo(slide.photo) : null} size={SLIDE_SIZE} />

      {slide.logo && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={t.logo}
          width={520}
          height={Math.round(520 / LOGO_RATIO)}
          alt="KickPact"
          style={{ marginBottom: 44 }}
        />
      )}

      {slide.kicker && <Kicker text={slide.kicker} tone={t} />}

      <div
        style={{
          maxWidth: CONTENT_WIDTH,
          fontFamily: DISPLAY,
          fontSize: headlineSize(slide.headline, hasPacts ? 74 : 92),
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
            fontSize: 36,
            fontWeight: 400,
            color: t.body,
            lineHeight: 1.42,
            marginTop: 30
          }}
        >
          {typo(slide.body)}
        </div>
      )}

      {slide.pacts && <PactCards pacts={slide.pacts} tone={t} width={CONTENT_WIDTH} />}

      <Footer tone={t} index={index} total={total} pad={PAD} showLogo={!slide.logo} />
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
 *
 * `Spieler X` ist als echtes Produkt-Label (so heißt der Trigger im Builder)
 * explizit erlaubt — sonst schlägt der Guard auf dem eigenen Feature an.
 */
function assertNoPlaceholders(deck: Deck): void {
  const text = [
    deck.caption,
    ...deck.slides.flatMap((s) => [
      s.kicker ?? "",
      s.headline,
      s.body ?? "",
      ...(s.pacts ?? []).map((p) => p.label)
    ])
  ].join(" ");
  const hit = text.match(/\[[A-Za-z0-9_ ]+\]/);
  if (hit) {
    throw new Error(
      `Deck "${deck.slug}" enthält noch den Platzhalter ${hit[0]}. ` +
        `Echtes Detail eintragen oder Deck rausnehmen — nichts erfinden.`
    );
  }
}

/** tone: "photo" ohne Foto wäre eine leere Fläche. Früh und laut scheitern. */
function assertPhotos(deck: Deck): void {
  for (const [i, s] of deck.slides.entries()) {
    if (s.tone === "photo" && !s.photo) {
      throw new Error(`Deck "${deck.slug}", Slide ${i + 1}: tone "photo" ohne photo-Feld.`);
    }
  }
}

async function renderDeck(deck: Deck): Promise<number> {
  assertNoPlaceholders(deck);
  assertPhotos(deck);
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
   * Ordner aufmacht, sieht acht Decks und lädt irgendwann das falsche hoch.
   * Ein Content-Ordner muss zeigen, was JETZT gilt, nicht die Geschichte.
   */
  if (!filter.length && existsSync(OUT)) {
    const gueltig = new Set([...DECKS.map((d) => d.slug), "video"]);
    for (const eintrag of readdirSync(OUT, { withFileTypes: true })) {
      if (eintrag.isDirectory() && !gueltig.has(eintrag.name)) {
        rmSync(join(OUT, eintrag.name), { recursive: true, force: true });
        console.log(`  ${eintrag.name.padEnd(30)} verwaist, entfernt`);
      }
    }
  }

  let slides = 0;
  for (const deck of decks) {
    slides += await renderDeck(deck);
    console.log(`  ${deck.slug.padEnd(30)} ${deck.slides.length} Slides`);
  }

  console.log(`\n${slides} PNGs → out/social/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
