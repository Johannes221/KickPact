import React from "react";
import type { Pact, Tone } from "./decks";
import {
  DISPLAY,
  GREEN,
  GREEN_DARK,
  LOGO_ON_LIGHT,
  LOGO_RATIO,
  LOGO_WHITE,
  MARK_GREEN,
  MARK_WHITE,
  NAVY,
  OFF_WHITE,
  WHITE,
  typo
} from "./brand";

/**
 * Die Bausteine, die Karussell (render.tsx) und Reel (video.tsx) teilen.
 *
 * Getrennt von beiden Renderern, weil sonst garantiert zwei Fassungen der
 * Pact-Karte entstehen und nach dem dritten Post verschieden aussehen.
 */

/* -------------------------------- Tonarten -------------------------------- */

export interface ToneSpec {
  bg: string;
  ink: string;
  kicker: string;
  body: string;
  logo: string;
  mark: string;
  /** Aktiver Punkt / Fortschrittsbalken. */
  dot: string;
  dotOff: string;
  /** Fläche der Pact-Karte und ihre Schrift. */
  cardBg: string;
  cardInk: string;
  cardAmount: string;
  cardBar: string;
}

/**
 * Die zwei Flächen. Ein Objekt statt verstreuter Ternaries: jede Farbe einer
 * Tonart steht an einer Stelle.
 *
 * Es gab mal eine dritte, `green`, als volle grüne Fläche. Raus seit 2026-07-17
 * („zu grün", Johannes). Das Grün trägt als AKZENT, nicht als Grund: Marke,
 * Kicker, Balken der Pact-Karte. Bewusst nicht als toter Code stehengelassen —
 * eine ungenutzte Tonart im System wird irgendwann wieder benutzt.
 *
 * Kontrast ist hier die ganze Arbeit, nicht Deko (Begründung in brand.ts):
 * grüner Text nur als GREEN_DARK, weil #01C457 auf Weiß nur ~2,4:1 hat.
 */
const TONES: Record<Tone, ToneSpec> = {
  light: {
    bg: WHITE,
    ink: NAVY,
    kicker: GREEN_DARK,
    body: "rgba(26,26,46,0.66)",
    logo: LOGO_ON_LIGHT,
    mark: MARK_GREEN,
    dot: GREEN,
    dotOff: "rgba(26,26,46,0.16)",
    cardBg: OFF_WHITE,
    cardInk: NAVY,
    cardAmount: GREEN_DARK,
    cardBar: GREEN
  },
  /**
   * Foto mit Navy-Schleier. Der Schleier ist nicht Geschmack: weißer Text auf
   * einem ungefilterten Foto ist je nach Bildstelle unlesbar, und ein Amateur-
   * platz bei Flutlicht hat beides, sehr hell und sehr dunkel, in einem Bild.
   */
  photo: {
    bg: NAVY,
    ink: WHITE,
    kicker: GREEN,
    body: "rgba(255,255,255,0.82)",
    logo: LOGO_WHITE,
    mark: MARK_WHITE,
    dot: GREEN,
    dotOff: "rgba(255,255,255,0.3)",
    cardBg: "rgba(255,255,255,0.94)",
    cardInk: NAVY,
    cardAmount: GREEN_DARK,
    cardBar: GREEN
  }
};

export function tone(t: Tone | undefined): ToneSpec {
  return TONES[t ?? "light"];
}

/* -------------------------------- Backdrop -------------------------------- */

/**
 * Was hinter dem Text liegt: entweder das Foto mit Schleier, oder die K-Marke
 * als große, sehr dezente Grafik.
 *
 * Die Marke macht aus einer leeren weißen Fläche eine gestaltete. Sie sitzt
 * angeschnitten in der Ecke und ist bewusst schwach — sie soll den Text nicht
 * bekämpfen, sondern den Rand füllen, der sonst tot ist.
 */
export function Backdrop({
  tone: t,
  photo,
  size
}: {
  tone: ToneSpec;
  photo: string | null;
  size: { width: number; height: number };
}) {
  if (photo) {
    return (
      <div style={{ position: "absolute", top: 0, left: 0, display: "flex" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo}
          width={size.width}
          height={size.height}
          alt=""
          style={{ objectFit: "cover" }}
        />
        {/* Schleier: oben dunkler, damit Kicker und Headline immer sitzen. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: size.width,
            height: size.height,
            background: `linear-gradient(180deg, rgba(26,26,46,0.86) 0%, rgba(26,26,46,0.62) 55%, rgba(26,26,46,0.88) 100%)`
          }}
        />
      </div>
    );
  }

  const M = Math.round(size.width * 0.92);
  return (
    <div
      style={{
        position: "absolute",
        top: -Math.round(M * 0.22),
        right: -Math.round(M * 0.34),
        display: "flex",
        opacity: 0.07
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={t.mark} width={M} height={M} alt="" />
    </div>
  );
}

/* --------------------------------- Kicker --------------------------------- */

/** Caps-Label mit grünem Merker davor. */
export function Kicker({ text, tone: t }: { text: string; tone: ToneSpec }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
      <div style={{ width: 28, height: 6, borderRadius: 3, background: t.kicker }} />
      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
          color: t.kicker,
          letterSpacing: "0.16em",
          textTransform: "uppercase"
        }}
      >
        {typo(text)}
      </div>
    </div>
  );
}

/* ------------------------------ Pact-Karten ------------------------------- */

/**
 * Beispiel-Regeln als Karten: Label links, Betrag rechts, grüner Balken davor.
 *
 * Absichtlich gebaut wie die Regel-Zeilen im Pact-Builder: wer den Post sieht
 * und dann die App öffnet, erkennt es wieder. Ein Post, der etwas anderes zeigt
 * als das Produkt, ist eine Enttäuschung mit Anlauf.
 *
 * KEINE Emojis, obwohl die Produkt-UI welche hat: Satori braucht dafür einen
 * Emoji-Font oder lädt sie per CDN nach. In app/opengraph-image.tsx ist genau
 * das schon einmal auf die Nase gefallen (fehlender Emoji-Font auf dem
 * Coolify-Node), das Layout dort ist seitdem bewusst emoji-frei. Der grüne
 * Balken macht denselben Job und kann nicht fehlschlagen.
 */
export function PactCards({
  pacts,
  tone: t,
  width
}: {
  pacts: Pact[];
  tone: ToneSpec;
  width: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 38 }}>
      {pacts.map((p) => (
        <div
          key={p.label}
          style={{
            display: "flex",
            alignItems: "center",
            width,
            background: t.cardBg,
            borderRadius: 18,
            padding: "22px 28px 22px 0",
            overflow: "hidden"
          }}
        >
          <div
            style={{
              width: 10,
              height: 92,
              background: t.cardBar,
              marginRight: 28,
              display: "flex"
            }}
          />
          <div
            style={{
              flex: 1,
              fontSize: 36,
              fontWeight: 700,
              color: t.cardInk,
              letterSpacing: "-0.01em"
            }}
          >
            {typo(p.label)}
          </div>
          <div
            style={{
              fontFamily: DISPLAY,
              fontSize: 42,
              fontWeight: 900,
              color: t.cardAmount,
              letterSpacing: "-0.02em"
            }}
          >
            {typo(p.amount)}
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- Footer --------------------------------- */

/**
 * Fortschritt + Logo. Der Punkt-Strip ist der „weiterwischen"-Hinweis.
 *
 * `showLogo` ist false, wenn der Slide das Logo schon groß in der Fläche trägt.
 * Sonst steht es zweimal auf demselben Bild (real passiert) und das liest sich
 * als Fehler, nicht als Branding.
 */
export function Footer({
  tone: t,
  index,
  total,
  pad,
  showLogo = true
}: {
  tone: ToneSpec;
  index: number;
  total: number;
  pad: number;
  showLogo?: boolean;
}) {
  const LOGO_W = 190;
  return (
    <div
      style={{
        position: "absolute",
        bottom: pad,
        left: pad,
        right: pad,
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
              background: i === index ? t.dot : t.dotOff
            }}
          />
        ))}
      </div>
      {showLogo && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={t.logo} width={LOGO_W} height={Math.round(LOGO_W / LOGO_RATIO)} alt="KickPact" />
      )}
    </div>
  );
}

/* -------------------------------- Typografie ------------------------------ */

/**
 * Headline-Größe nach Länge. Satori bricht um, aber ein Fünfzeiler in voller
 * Größe erschlägt die Fläche. Die Stufen halten die Headline bei etwa drei
 * Zeilen, egal wie lang der Satz ist.
 *
 * `max` sinkt, wenn unter der Headline noch Pact-Karten stehen — sonst reicht
 * die Höhe nicht und die unterste Karte läuft aus dem Bild.
 *
 * Montserrat Alternates Black läuft breit, die Schwellen sind daran kalibriert
 * und nicht an Inter.
 */
export function headlineSize(text: string, max: number): number {
  if (text.length <= 26) return max;
  if (text.length <= 46) return Math.round(max * 0.8);
  return Math.round(max * 0.65);
}
