import { BODY_FAMILY, DISPLAY_FAMILY, displayTextWidth } from "@/lib/og/fonts";
import {
  ALERT_RED,
  GREEN,
  GREEN_DARK,
  LOGO_ON_LIGHT,
  LOGO_RATIO,
  NAVY,
  WHITE
} from "@/lib/og/brand";
import type { StoryModel, StorySide } from "@/lib/story/story-data";
import type { StoryCrest } from "@/lib/story/story-content";

/**
 * Reines Zeichnen der Story-Vorlagen (Aufgabe #44) — kein Auth, kein DB-Zugriff.
 *
 * Bewusst getrennt von der Route: so lassen sich die Motive mit erfundenen
 * Modellen rendern und ANSCHAUEN — insbesondere die Degradations-Fälle (kein
 * Logo, keine Tabelle, keine Torschützen), die live kaum reproduzierbar sind:
 *
 *   STORY_SAMPLE_DIR=/tmp/story npx vitest run tests/lib/story-card.test.tsx
 *
 * Farben und Logo kommen aus lib/og/brand.ts — derselben Quelle wie die
 * Social-Posts (scripts/social/). Sonst postet der Marketing-Kanal beim ersten
 * Farbwechsel ein anderes Produkt, als die App ausliefert.
 */

/** Innenbreite des Motivs (1080 − 2×80 Padding) — Basis fürs Auto-Fit. */
export const CONTENT_WIDTH = 920;
/** letter-spacing der Headlines in em — muss zum `letterSpacing` unten passen. */
export const HEADLINE_TRACKING = -0.03;

/**
 * Schriftgröße einer einzeiligen Headline, die garantiert in die Breite passt.
 *
 * Satori bricht zu lange Zeilen nicht um und skaliert auch nichts — es schneidet
 * am Rand ab. Ohne diesen Fit lief „UNENTSCHIEDEN" bei fester Größe rechts aus
 * dem Bild (im gerenderten Motiv gesehen), und genau dieses Motiv wäre dann auf
 * Instagram gelandet.
 *
 * Vermessen wird gegen die Datei, die auch GERENDERT wird (Display = Montserrat
 * Alternates Black). Die frühere Schätzung über eine mittlere Zeichenbreite war
 * an einer anderen Schrift kalibriert und lag bei „UNENTSCHIEDEN" um 50px
 * daneben, nach draußen. `displayTextWidth` ist linear in der Schriftgröße,
 * deshalb genügt eine Messung bei 1px als Verhältnis.
 *
 * Gemessen wird GROSSGESCHRIEBEN, weil beide Aufrufstellen `textTransform:
 * uppercase` setzen. „Unentschieden" zu messen und „UNENTSCHIEDEN" zu rendern
 * unterschätzt die Breite je nach Wort um bis zu 19% — dann greift der Fit zu
 * spät und schneidet doch ab.
 */
export function fitFontSize(text: string, max: number): number {
  const widthPerPx = displayTextWidth(text.toUpperCase(), 1, HEADLINE_TRACKING);
  if (widthPerPx <= 0) return max;
  return Math.floor(Math.min(max, CONTENT_WIDTH / widthPerPx));
}

/**
 * Der Ausgang eines Spiels als Farbpaar — Fläche und Text sind NICHT dasselbe.
 *
 * Grund steht in lib/og/brand.ts: Primary Green hat auf Weiß 2,32:1 und ist als
 * Text unlesbar, als Fläche trägt es. Deshalb pro Ausgang eine `flaeche` (Badge-
 * Tint, Wappenring, Kante) und eine `tinte` (Kicker, Labels).
 *
 * Unentschieden läuft neutral auf Navy: die CI hat kein Orange (Johannes,
 * 2026-07-17), und ein Remis ist inhaltlich weder gut noch schlecht.
 */
const OUTCOME = {
  sieg: { flaeche: GREEN, tinte: GREEN_DARK },
  unentschieden: { flaeche: NAVY, tinte: NAVY },
  niederlage: { flaeche: ALERT_RED, tinte: ALERT_RED }
} as const;

/** Text auf Weiß, zurückgenommen — für Meta-Zeilen und Nebensachen. */
const MUTED = "rgba(26,26,46,0.62)";

/** Story-Format: 9:16, wie Instagram es erwartet. */
export const STORY_SIZE = { width: 1080, height: 1920 } as const;

/**
 * 9:16-Story-Motiv für ein Spiel — zwei Vorlagen:
 *   - Vorschau  (kommendes Spiel): Duell, Wochentag, Liga, Tabellenplätze
 *   - Rückblick (gespieltes Spiel): Ergebnis, Ausgangs-Headline, Torschützen
 *
 * Welche Vorlage, entscheidet `buildStoryModel` anhand des Spielstatus.
 */
export function StoryCard({ model }: { model: StoryModel }) {
  // Rückblick färbt sich nach Ausgang. Vorschau und unsicherer Ausgang laufen
  // grün — die Marke, nicht das Ergebnis: vor dem Anpfiff gibt es keins, und
  // bei unsicherer eigener Seite dürfen wir keins behaupten.
  const tone =
    model.kind === "vorschau" || !model.headline
      ? { flaeche: GREEN, tinte: GREEN_DARK }
      : OUTCOME[model.headline.outcome];

  return (
    <div
      style={{
        width: 1080,
        height: 1920,
        background: WHITE,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        fontFamily: BODY_FAMILY,
        padding: "96px 80px"
      }}
    >
      {/* Ausgangsfarbe als Kante oben — das einzige Vollton-Grün im Motiv, und
          damit auf Weiß der Anker, der ohne Lesen sagt, wie es ausging. Die
          früheren Glow-Kreise sind raus: auf Navy trugen sie, auf Weiß werden
          sie zu schmutzigen Schleiern. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 14,
          background: tone.flaeche
        }}
      />

      <Header model={model} tone={tone} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
          gap: 56
        }}
      >
        {model.kind === "vorschau" ? (
          <PreviewBody model={model} tone={tone} />
        ) : (
          <RecapBody model={model} tone={tone} />
        )}
      </div>

      <PresentedBy />
    </div>
  );
}

/** Fläche + Tinte eines Ausgangs — s. OUTCOME. */
type Tone = { flaeche: string; tinte: string };

/** Kopf: Badge (Vorschau/Ergebnis) + Liga + Datum. Liga fehlt vor dem 1. Crawl. */
function Header({ model, tone }: { model: StoryModel; tone: Tone }) {
  const badge = model.kind === "vorschau" ? "NÄCHSTES SPIEL" : "SPIELBERICHT";
  const meta = [model.league, model.dateLine].filter(Boolean).join(" · ");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex" }}>
        <div
          style={{
            // Fläche als Tint, Schrift in der dunklen Tinte: Vollton-Grün mit
            // grüner Schrift wäre auf Weiß unlesbar (s. lib/og/brand.ts).
            background: `${tone.flaeche}1F`,
            borderRadius: 24,
            padding: "10px 24px",
            color: tone.tinte,
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: "0.18em"
          }}
        >
          {badge}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 34,
          color: MUTED,
          fontWeight: 400
        }}
      >
        {meta}
      </div>
    </div>
  );
}

/**
 * Wappen einer Seite — echtes Logo, sonst das Kürzel.
 *
 * BEIDE Fälle ohne Kreis, Rahmen und Tint-Fläche (Johannes, 2026-07-17): ein
 * Ring um ein Wappen, das selbst schon eine Kontur hat, gibt zwei konkurrierende
 * Umrisse, und um ein Kürzel gelegt sah er nach Platzhalter aus statt nach
 * Absicht. Der Slot behält seine 240px, damit die Spalten weiter fluchten und
 * DuelRow die Mitte trifft — nur die Deko ist weg.
 */
function Crest({ crest }: { crest: StoryCrest }) {
  const SIZE = CREST_SIZE;
  if (crest.kind === "logo") {
    return (
      <div
        style={{
          display: "flex",
          width: SIZE,
          height: SIZE,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={crest.src} width={SIZE} height={SIZE} alt="" style={{ objectFit: "contain" }} />
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        width: SIZE,
        height: SIZE,
        alignItems: "center",
        justifyContent: "center",
        color: NAVY,
        fontFamily: DISPLAY_FAMILY,
        // Ohne Kreis trägt das Kürzel die Fläche allein und darf größer werden —
        // aber kleiner als der Endstand bleiben: sonst lesen sich „SVS 3:1 FCB"
        // als eine gleichrangige Zeile und das Ergebnis geht darin unter.
        fontSize: crest.text.length >= 4 ? 74 : 92,
        fontWeight: 900,
        letterSpacing: "-0.03em"
      }}
    >
      {crest.text}
    </div>
  );
}

const CREST_SIZE = 240;
const COLUMN_WIDTH = 380;
/** Feste Höhe des Namensfelds (2 Zeilen à 32px) — s. SideColumn. */
const NAME_HEIGHT = 84;

/**
 * Eine Duell-Seite: Wappen, Name, Tabellenplatz.
 *
 * Namensfeld hat FESTE Breite und Höhe. Beides ist nötig, nicht kosmetisch:
 * ohne feste Breite sprengt ein langer Vereinsname die Spalte und schiebt das
 * Wappen aus der Mitte; ohne feste Höhe steht die eine Seite höher als die
 * andere, sobald ein Name zweizeilig umbricht (dann fluchten weder Wappen noch
 * Tabellenplatz-Badges). Beides live gesehen beim Render der Beispiele.
 */
function SideColumn({ side, tone }: { side: StorySide; tone: Tone }) {
  // ~2 Zeilen à ~14 Zeichen bei 32px auf 380px Breite.
  const name = side.name.length > 30 ? `${side.name.slice(0, 29)}…` : side.name;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
        width: COLUMN_WIDTH
      }}
    >
      <Crest crest={side.crest} />
      <div
        style={{
          display: "flex",
          width: COLUMN_WIDTH,
          height: NAME_HEIGHT,
          justifyContent: "center",
          fontSize: 32,
          fontWeight: 700,
          color: NAVY,
          textAlign: "center",
          lineHeight: 1.25,
          overflow: "hidden"
        }}
      >
        {name}
      </div>
      {side.position !== null && (
        <div
          style={{
            display: "flex",
            borderRadius: 999,
            background: "rgba(26,26,46,0.06)",
            padding: "6px 18px",
            fontSize: 24,
            fontWeight: 700,
            color: MUTED
          }}
        >
          {`Platz ${side.position}`}
        </div>
      )}
    </div>
  );
}

/**
 * Mitte des Duells: „VS" (Vorschau) bzw. der Endstand (Rückblick).
 *
 * Die Spalten hängen oben (`flex-start`), damit die Wappen unabhängig von der
 * Namenslänge auf einer Linie liegen; die Mitte wird über die Wappenhöhe
 * zentriert, damit der Endstand auf Wappen-Mitte sitzt.
 */
function DuelRow({
  model,
  tone,
  center
}: {
  model: StoryModel;
  tone: Tone;
  center: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between"
      }}
    >
      <SideColumn side={model.heim} tone={tone} />
      <div
        style={{
          display: "flex",
          height: CREST_SIZE,
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {center}
      </div>
      <SideColumn side={model.gast} tone={tone} />
    </div>
  );
}

function PreviewBody({ model, tone }: { model: PreviewStoryProps; tone: Tone }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 64 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            display: "flex",
            fontFamily: DISPLAY_FAMILY,
            fontSize: fitFontSize(model.kickoff, 150),
            fontWeight: 900,
            color: NAVY,
            letterSpacing: `${HEADLINE_TRACKING}em`,
            lineHeight: 1.02,
            textTransform: "uppercase"
          }}
        >
          {model.kickoff}
        </div>
        {/* Bewusst OHNE Anstoßzeit: die DB hat keine echte (siehe story-data.ts).
            Heim/Auswärts nur, wenn die eigene Seite sicher ist (heimspiel !== null). */}
        {model.heimspiel !== null && (
          <div style={{ display: "flex", fontSize: 44, color: tone.tinte, fontWeight: 700 }}>
            {model.heimspiel ? "Heimspiel" : "Auswärtsspiel"}
          </div>
        )}
      </div>

      <DuelRow
        model={model}
        tone={tone}
        center={
          <div
            style={{
              display: "flex",
              fontFamily: DISPLAY_FAMILY,
              fontSize: 56,
              fontWeight: 900,
              color: "rgba(26,26,46,0.3)",
              letterSpacing: "0.04em"
            }}
          >
            VS
          </div>
        }
      />
    </div>
  );
}

function RecapBody({ model, tone }: { model: RecapStoryProps; tone: Tone }) {
  /**
   * Ohne verlässliche eigene Seite (Reserve-Derby ohne team-ids) gibt es keine
   * Ausgangs-Headline. Dann ist „Endstand" die Überschrift — neutral und
   * unabhängig davon, auf welcher Seite wir stehen. Das Ergebnis selbst steht
   * schon im Duell; es hier zu wiederholen wäre nur doppelt.
   */
  const held = model.headline?.headline ?? "Endstand";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 56 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            display: "flex",
            fontFamily: DISPLAY_FAMILY,
            fontSize: fitFontSize(held, 132),
            fontWeight: 900,
            color: NAVY,
            letterSpacing: `${HEADLINE_TRACKING}em`,
            lineHeight: 1.02,
            textTransform: "uppercase"
          }}
        >
          {held}
        </div>
        {model.headline && (
          <div style={{ display: "flex", fontSize: 40, color: tone.tinte, fontWeight: 700 }}>
            {model.headline.kicker}
          </div>
        )}
      </div>

      <DuelRow
        model={model}
        tone={tone}
        center={
          <div
            style={{
              display: "flex",
              fontFamily: DISPLAY_FAMILY,
              fontSize: 132,
              fontWeight: 900,
              color: NAVY,
              letterSpacing: "-0.02em"
            }}
          >
            {`${model.ergebnisHeim}:${model.ergebnisGast}`}
          </div>
        }
      />

      <Scorers model={model} tone={tone} />
    </div>
  );
}

/**
 * Torschützen der eigenen Seite. Fehlen sie (fussball.de führt sie nur bei
 * Herren/Frauen/A+B-Jugend zuverlässig), wird der Block KOMPLETT weggelassen —
 * kein leerer Platzhalter, kein „—".
 */
function Scorers({ model, tone }: { model: RecapStoryProps; tone: Tone }) {
  if (model.scorers.length === 0) return null;
  // Bei sehr vielen Torschützen den Rest zusammenfassen statt zu überlaufen.
  const shown = model.scorers.slice(0, 5);
  const rest = model.scorers.length - shown.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          display: "flex",
          fontSize: 28,
          color: tone.tinte,
          fontWeight: 700,
          letterSpacing: "0.16em",
          textTransform: "uppercase"
        }}
      >
        {model.scorers.length === 1 ? "Torschütze" : "Torschützen"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {shown.map((s) => (
          <div
            key={s.name}
            style={{ display: "flex", fontSize: 38, color: NAVY, fontWeight: 700 }}
          >
            {s.tore > 1 ? `${s.name} (${s.tore})` : s.name}
          </div>
        ))}
        {rest > 0 && (
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: MUTED,
              fontWeight: 400
            }}
          >
            {`+ ${rest} weitere`}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * „presented by KickPact" — immer unten (bewusster Werbekanal, #44).
 *
 * Primärlogo (2-farbig), nicht die grüne Variante: der Grund steht in der
 * Brand-README — Primär ist der Default für helle Flächen, einfarbig nur, wenn
 * der Hintergrund es erzwingt. Auf Weiß erzwingt nichts.
 */
const LOGO_WIDTH = 304;

function PresentedBy() {
  return (
    <div
      style={{
        position: "absolute",
        bottom: 80,
        left: 80,
        right: 80,
        display: "flex",
        alignItems: "center",
        gap: 20
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 28,
          color: MUTED,
          fontWeight: 400
        }}
      >
        presented by
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOGO_ON_LIGHT}
        width={LOGO_WIDTH}
        height={Math.round(LOGO_WIDTH / LOGO_RATIO)}
        alt="KickPact"
        style={{ objectFit: "contain" }}
      />
    </div>
  );
}

type PreviewStoryProps = Extract<StoryModel, { kind: "vorschau" }>;
type RecapStoryProps = Extract<StoryModel, { kind: "rueckblick" }>;
