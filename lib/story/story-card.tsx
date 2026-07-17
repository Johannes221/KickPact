import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OG_FONT_FAMILY, blackTextWidth } from "@/lib/og/fonts";
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
 */

// Grünes KickPact-Logo einmalig als data-URI — next/og (Satori) bettet lokale
// Assets nur als data-URI/absolute-URL zuverlässig ein (wie wrapped-image).
const LOGO_GREEN =
  "data:image/png;base64," +
  readFileSync(join(process.cwd(), "public/brand/logo-green-horizontal.png")).toString(
    "base64"
  );

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
 * Die Breite wird in der ECHTEN Headline-Schrift (Inter Black) vermessen statt
 * über eine mittlere Zeichenbreite geschätzt — die Schätzung war an Satoris
 * Regular-Fallback kalibriert und lag mit Inter Black bei „UNENTSCHIEDEN" um
 * 50px daneben, nach draußen.
 * `blackTextWidth` ist linear in der Schriftgröße, deshalb genügt eine Messung
 * bei 1px als Verhältnis.
 *
 * Gemessen wird GROSSGESCHRIEBEN, weil beide Aufrufstellen `textTransform:
 * uppercase` setzen. „Unentschieden" zu messen und „UNENTSCHIEDEN" zu rendern
 * unterschätzt die Breite je nach Wort um bis zu 19% — dann greift der Fit zu
 * spät und schneidet doch ab.
 */
export function fitFontSize(text: string, max: number): number {
  const widthPerPx = blackTextWidth(text.toUpperCase(), 1, HEADLINE_TRACKING);
  if (widthPerPx <= 0) return max;
  return Math.floor(Math.min(max, CONTENT_WIDTH / widthPerPx));
}

const NAVY = "#0F0F1E";
const ORANGE = "#FF6A30";
const RED = "#FF3127";
const LIME = "#A3E635";
const OFF = "#F8F7F4";

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
  // Rückblick färbt sich nach Ausgang: Sieg = Lime, Unentschieden = Orange,
  // Niederlage = Rot. Vorschau und unsicherer Ausgang bleiben Brand-Orange.
  const accent =
    model.kind === "vorschau" || !model.headline
      ? ORANGE
      : model.headline.outcome === "sieg"
        ? LIME
        : model.headline.outcome === "unentschieden"
          ? ORANGE
          : RED;

  return (
    <div
      style={{
        width: 1080,
        height: 1920,
        background: NAVY,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        fontFamily: OG_FONT_FAMILY,
        padding: "96px 80px"
      }}
    >
      {/* Akzent-Glow + Brand-Kante — identisch zum Wrapped-Look */}
      <div
        style={{
          position: "absolute",
          top: -160,
          right: -160,
          width: 640,
          height: 640,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}38 0%, ${accent}00 70%)`
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -140,
          left: -140,
          width: 520,
          height: 520,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(163,230,53,0.14) 0%, rgba(163,230,53,0) 70%)"
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 10,
          background: `linear-gradient(to right, ${ORANGE}, ${RED}, ${LIME})`
        }}
      />

      <Header model={model} accent={accent} />

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
          <PreviewBody model={model} accent={accent} />
        ) : (
          <RecapBody model={model} accent={accent} />
        )}
      </div>

      <PresentedBy />
    </div>
  );
}

/** Kopf: Badge (Vorschau/Ergebnis) + Liga + Datum. Liga fehlt vor dem 1. Crawl. */
function Header({ model, accent }: { model: StoryModel; accent: string }) {
  const badge = model.kind === "vorschau" ? "NÄCHSTES SPIEL" : "SPIELBERICHT";
  const meta = [model.league, model.dateLine].filter(Boolean).join(" · ");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex" }}>
        <div
          style={{
            background: `${accent}26`,
            border: `1px solid ${accent}59`,
            borderRadius: 24,
            padding: "10px 24px",
            color: accent,
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
          color: "rgba(248,247,244,0.6)",
          fontWeight: 600
        }}
      >
        {meta}
      </div>
    </div>
  );
}

/** Wappen: hochgeladenes/übernommenes Logo — sonst das Kürzel als Gestaltung. */
function Crest({ crest, accent }: { crest: StoryCrest; accent: string }) {
  const SIZE = CREST_SIZE;
  if (crest.kind === "logo") {
    return (
      <div
        style={{
          display: "flex",
          width: SIZE,
          height: SIZE,
          borderRadius: "50%",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.12)",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden"
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={crest.src}
          width={SIZE - 40}
          height={SIZE - 40}
          alt=""
          style={{ objectFit: "contain" }}
        />
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        width: SIZE,
        height: SIZE,
        borderRadius: "50%",
        background: `${accent}1F`,
        border: `2px solid ${accent}66`,
        alignItems: "center",
        justifyContent: "center",
        color: accent,
        fontSize: crest.text.length >= 4 ? 68 : 84,
        fontWeight: 900,
        letterSpacing: "-0.02em"
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
function SideColumn({ side, accent }: { side: StorySide; accent: string }) {
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
      <Crest crest={side.crest} accent={accent} />
      <div
        style={{
          display: "flex",
          width: COLUMN_WIDTH,
          height: NAME_HEIGHT,
          justifyContent: "center",
          fontSize: 32,
          fontWeight: 900,
          color: OFF,
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
            background: "rgba(255,255,255,0.08)",
            padding: "6px 18px",
            fontSize: 24,
            fontWeight: 700,
            color: "rgba(248,247,244,0.7)"
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
  accent,
  center
}: {
  model: StoryModel;
  accent: string;
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
      <SideColumn side={model.heim} accent={accent} />
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
      <SideColumn side={model.gast} accent={accent} />
    </div>
  );
}

function PreviewBody({ model, accent }: { model: PreviewStoryProps; accent: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 64 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            display: "flex",
            fontSize: fitFontSize(model.kickoff, 150),
            fontWeight: 900,
            color: OFF,
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
          <div style={{ display: "flex", fontSize: 44, color: accent, fontWeight: 900 }}>
            {model.heimspiel ? "Heimspiel" : "Auswärtsspiel"}
          </div>
        )}
      </div>

      <DuelRow
        model={model}
        accent={accent}
        center={
          <div
            style={{
              display: "flex",
              fontSize: 56,
              fontWeight: 900,
              color: "rgba(248,247,244,0.35)",
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

function RecapBody({ model, accent }: { model: RecapStoryProps; accent: string }) {
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
            fontSize: fitFontSize(held, 132),
            fontWeight: 900,
            color: OFF,
            letterSpacing: `${HEADLINE_TRACKING}em`,
            lineHeight: 1.02,
            textTransform: "uppercase"
          }}
        >
          {held}
        </div>
        {model.headline && (
          <div style={{ display: "flex", fontSize: 40, color: accent, fontWeight: 900 }}>
            {model.headline.kicker}
          </div>
        )}
      </div>

      <DuelRow
        model={model}
        accent={accent}
        center={
          <div
            style={{
              display: "flex",
              fontSize: 96,
              fontWeight: 900,
              color: OFF,
              letterSpacing: "-0.02em"
            }}
          >
            {`${model.ergebnisHeim}:${model.ergebnisGast}`}
          </div>
        }
      />

      <Scorers model={model} accent={accent} />
    </div>
  );
}

/**
 * Torschützen der eigenen Seite. Fehlen sie (fussball.de führt sie nur bei
 * Herren/Frauen/A+B-Jugend zuverlässig), wird der Block KOMPLETT weggelassen —
 * kein leerer Platzhalter, kein „—".
 */
function Scorers({ model, accent }: { model: RecapStoryProps; accent: string }) {
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
          color: accent,
          fontWeight: 900,
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
            style={{ display: "flex", fontSize: 38, color: OFF, fontWeight: 700 }}
          >
            {s.tore > 1 ? `${s.name} (${s.tore})` : s.name}
          </div>
        ))}
        {rest > 0 && (
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "rgba(248,247,244,0.55)",
              fontWeight: 600
            }}
          >
            {`+ ${rest} weitere`}
          </div>
        )}
      </div>
    </div>
  );
}

/** „presented by KickPact" — immer unten (bewusster Werbekanal, #44). */
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
          color: "rgba(248,247,244,0.55)",
          fontWeight: 600
        }}
      >
        presented by
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={LOGO_GREEN}
        width={304}
        height={40}
        alt="KickPact"
        style={{ objectFit: "contain" }}
      />
    </div>
  );
}

type PreviewStoryProps = Extract<StoryModel, { kind: "vorschau" }>;
type RecapStoryProps = Extract<StoryModel, { kind: "rueckblick" }>;
