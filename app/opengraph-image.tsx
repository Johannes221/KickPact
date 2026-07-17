import { ImageResponse } from "next/og";
import { OG_FONTS, BODY_FAMILY, DISPLAY_FAMILY } from "@/lib/og/fonts";
import { GREEN, GREEN_DARK, LOGO_ON_LIGHT, LOGO_RATIO, NAVY, WHITE } from "@/lib/og/brand";

// Bewusst KEIN edge-Runtime: auf dem self-hosted Coolify-Node liefert die
// Edge-ImageResponse 502 (kein Emoji-Font im Edge-Sandbox → Render-Crash bei
// ⚽/🏆/⬆️). Node-Runtime + emoji-freies Layout rendern das OG-Bild zuverlässig.
export const alt = "KickPact — Performance-Sponsoring für Amateurfußball";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Das Bild, das bei jedem geteilten Link erscheint — Whatsapp, iMessage, Slack.
 *
 * Auf CI umgebaut (Johannes, 2026-07-17): weiße Fläche, Navy-Text, Grün als
 * Akzent. Vorher lief es auf Navy mit #FF4500-Orange — eine Farbe, die in der
 * KickPact-CI gar nicht vorkommt (public/brand/README.md).
 *
 * Der Schriftzug ist jetzt das PRIMÄRLOGO ALS BILD. Vorher stand hier ein
 * getipptes „Kick" + „Pact" in Weiß/Orange plus ein Farbverlaufs-Kreis als
 * Pseudo-Marke. Das war nicht das Logo, sondern eine Nachahmung davon — in den
 * falschen Farben (echt ist: grüne Marke, KICK navy, PACT grün). Eine
 * vektorisierte 2-farbige Wortmarke existiert nicht (README: „es gibt keine
 * Font-/Designdatei dafür"), also gehört hier ein Bild hin, kein Text.
 */
const MUTED = "rgba(26,26,46,0.62)";
const LOGO_WIDTH = 560;

const PREISE = [
  { label: "Pro Tor", value: "5 €" },
  { label: "Pro Sieg", value: "50 €" },
  { label: "Pro Aufstieg", value: "200 €" }
];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: WHITE,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          overflow: "hidden",
          fontFamily: BODY_FAMILY
        }}
      >
        {/* Grüne Kante — das einzige Vollton-Grün, wie im Story-Motiv. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 10,
            background: GREEN
          }}
        />

        {/* Die linke Spalte ist BEGRENZT: rechts sitzen die Preis-Kacheln
            absolut, und KickPact Display ist breit gebaut — ohne maxWidth lief
            die Headline unter die Kacheln (im Render gesehen). */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 88px",
            height: "100%",
            maxWidth: 800
          }}
        >
          <div style={{ display: "flex", marginBottom: 30 }}>
            <div
              style={{
                display: "flex",
                background: `${GREEN}1F`,
                borderRadius: 20,
                padding: "8px 18px",
                color: GREEN_DARK,
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase"
              }}
            >
              Performance-Sponsoring · Amateurfußball
            </div>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={LOGO_ON_LIGHT}
            width={LOGO_WIDTH}
            height={Math.round(LOGO_WIDTH / LOGO_RATIO)}
            alt="KickPact"
            style={{ objectFit: "contain", marginBottom: 34 }}
          />

          {/* KEIN display:flex: in Satori wird ein Text damit zum einzeiligen
              Flex-Item und läuft rechts raus, statt umzubrechen. Als Block
              bricht er innerhalb der maxWidth oben um. */}
          <div
            style={{
              fontFamily: DISPLAY_FAMILY,
              fontSize: 44,
              fontWeight: 900,
              color: NAVY,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              marginBottom: 20
            }}
          >
            Macht die Mannschaftskasse voll.
          </div>

          <div style={{ fontSize: 24, color: MUTED, marginBottom: 8, lineHeight: 1.4 }}>
            Sponsoren zahlen pro Tor, Sieg oder Aufstieg — automatisch abgerechnet.
          </div>
          <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: GREEN_DARK }}>
            Weniger als 1 € pro Spieler im Monat.
          </div>
        </div>

        {/* Preis-Kacheln rechts */}
        <div
          style={{
            position: "absolute",
            right: 88,
            top: "50%",
            transform: "translateY(-50%)",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            alignItems: "flex-end"
          }}
        >
          {PREISE.map(({ label, value }) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "rgba(26,26,46,0.04)",
                border: "1px solid rgba(26,26,46,0.1)",
                borderRadius: 14,
                padding: "12px 20px"
              }}
            >
              <span style={{ fontSize: 17, color: MUTED, fontWeight: 400 }}>{label}</span>
              <span
                style={{
                  fontFamily: DISPLAY_FAMILY,
                  fontSize: 22,
                  fontWeight: 900,
                  color: NAVY,
                  marginLeft: 4
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts: OG_FONTS }
  );
}
