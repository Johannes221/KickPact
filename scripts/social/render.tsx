import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { ImageResponse } from "next/og";
import { DECKS, type Deck, type Format, type Slide } from "./decks";
import { STORIES } from "./stories";
import {
  BODY,
  DISPLAY,
  FONTS,
  LOGO_RATIO,
  SLIDE_SIZE,
  VERTICAL,
  photo,
  screenshot,
  typo
} from "./brand";
import { Backdrop, Footer, Kicker, PactCards, PhoneFrame, headlineSize, tone } from "./layout";
import { HASHTAG_LINE } from "./tags";

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

/**
 * Was pro Format anders ist. Ein Objekt statt Ternaries im Layout: ein drittes
 * Format ist ein Eintrag, kein Umbau.
 *
 * Die Story hat KEINE Fortschrittspunkte und ihr Logo sitzt oben — Instagram
 * legt bei Stories oben und unten eigene Bedienelemente über das Bild, unten
 * links wäre das Logo verdeckt. Dieselbe Regel wie im Reel (video.tsx).
 */
const FORMATS: Record<Format, { size: { width: number; height: number }; dir: string; dots: boolean; logoTop: boolean }> = {
  feed: { size: SLIDE_SIZE, dir: "karussell", dots: true, logoTop: false },
  story: { size: VERTICAL, dir: "stories", dots: false, logoTop: true }
};

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
  total,
  format
}: {
  slide: Slide;
  index: number;
  total: number;
  format: Format;
}) {
  const t = tone(slide.tone);
  const f = FORMATS[format];
  const hasPacts = Boolean(slide.pacts?.length);
  // Ein Handy-Rahmen frisst ~930px Höhe. Die Headline muss dafür Platz lassen.
  const hasShot = Boolean(slide.screenshot);

  return (
    <div
      style={{
        width: f.size.width,
        height: f.size.height,
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
      <Backdrop tone={t} photo={slide.photo ? photo(slide.photo) : null} size={f.size} />

      {/*
        Story: Logo auf JEDEM Slide oben links, klein.
        Nicht nur auf dem Aufschlag: der Footer trägt es im Feed auf jedem Slide,
        und den gibt es in der Story nicht (Instagram überdeckt unten). Ohne das
        hier hätten vier von sechs Story-Slides gar keine Marke drauf — und ein
        Highlight wird einzeln angetippt, jeder Slide ist also ein Erstkontakt.
        `slide.logo` wird in der Story bewusst ignoriert: ein zweites, großes Logo
        auf demselben Bild liest sich als Fehler.
      */}
      {f.logoTop && (
        <div style={{ position: "absolute", top: PAD, left: PAD, display: "flex" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={t.logo} width={240} height={Math.round(240 / LOGO_RATIO)} alt="KickPact" />
        </div>
      )}

      {slide.logo && !f.logoTop && (
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
          fontSize: headlineSize(slide.headline, hasPacts || hasShot ? 60 : 92, CONTENT_WIDTH),
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

      {slide.screenshot && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 40 }}>
          <PhoneFrame src={screenshot(slide.screenshot)} width={430} height={930} />
        </div>
      )}

      {/* Nur im Feed. In der Story liegen unten Instagrams eigene Bedienelemente
          drüber, ein Fortschrittsstrip dort wäre halb verdeckt und doppelt: die
          Story hat oben schon ihre eigenen Segment-Balken. */}
      {f.dots && (
        <Footer tone={t} index={index} total={total} pad={PAD} showLogo={!slide.logo} />
      )}
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
  const format = deck.format ?? "feed";
  const f = FORMATS[format];
  const dir = join(OUT, f.dir, deck.slug);
  mkdirSync(dir, { recursive: true });

  for (const [i, slide] of deck.slides.entries()) {
    const buf = await png(
      <SlideCard slide={slide} index={i} total={deck.slides.length} format={format} />,
      f.size
    );
    writeFileSync(join(dir, `${String(i + 1).padStart(2, "0")}.png`), buf);
  }

  // Caption + Hashtags als Textdatei daneben: der Post besteht aus beidem, und
  // beim Hochladen will man nicht zwischen zwei Quellen springen.
  writeFileSync(
    join(dir, "caption.txt"),
    // Hashtags nur unter Feed-Posts (Karussells) — Stories haben keine
    // Feed-Caption; dort nimmt man Hashtag-Sticker in der App.
    `${deck.caption}${(deck.format ?? "feed") === "feed" ? `\n\n${HASHTAG_LINE}` : ""}\n`,
    "utf8"
  );
  return deck.slides.length;
}

/**
 * Waisen wegräumen: Ordner von Decks, die es nicht mehr gibt (umbenannt oder
 * gestrichen).
 *
 * Real passiert am 2026-07-17: nach dem Umbau auf die CI standen die alten Decks
 * im alten Navy weiter neben den neuen. Wer den Ordner aufmacht, sieht acht
 * Decks und lädt irgendwann das falsche hoch. Ein Content-Ordner muss zeigen,
 * was JETZT gilt, nicht die Geschichte.
 *
 * Läuft pro Format-Unterordner und nur beim vollen Lauf — nur der weiß, welche
 * Decks es überhaupt gibt.
 */
function removeOrphans(dir: string, gueltig: Set<string>): void {
  const abs = join(OUT, dir);
  if (!existsSync(abs)) return;
  for (const eintrag of readdirSync(abs, { withFileTypes: true })) {
    if (eintrag.isDirectory() && !gueltig.has(eintrag.name)) {
      rmSync(join(abs, eintrag.name), { recursive: true, force: true });
      console.log(`  ${dir}/${eintrag.name.padEnd(26)} verwaist, entfernt`);
    }
  }
}

async function main() {
  const filter = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const alle = [...DECKS, ...STORIES];
  const decks = filter.length
    ? alle.filter((d) => filter.some((f) => d.slug.includes(f)))
    : alle;

  if (!decks.length) {
    console.error(`Kein Deck passt auf "${filter.join(" ")}".`);
    console.error(`Vorhanden: ${alle.map((d) => d.slug).join(", ")}`);
    process.exit(1);
  }

  // Nur die gewählten Decks neu bauen — ein gefilterter Lauf darf die Reels und
  // die anderen Decks nicht mitlöschen.
  for (const deck of decks) {
    rmSync(join(OUT, FORMATS[deck.format ?? "feed"].dir, deck.slug), {
      recursive: true,
      force: true
    });
  }

  if (!filter.length) {
    removeOrphans("karussell", new Set(DECKS.map((d) => d.slug)));
    removeOrphans("stories", new Set(STORIES.map((d) => d.slug)));
  }

  let slides = 0;
  for (const deck of decks) {
    slides += await renderDeck(deck);
    const f = FORMATS[deck.format ?? "feed"];
    console.log(`  ${f.dir}/${deck.slug.padEnd(26)} ${deck.slides.length} Slides`);
  }

  console.log(`\n${slides} PNGs → out/social/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
