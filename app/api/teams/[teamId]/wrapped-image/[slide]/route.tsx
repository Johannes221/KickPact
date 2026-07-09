import { ImageResponse } from "next/og";
import { requireUser } from "@/lib/auth/session";
import { resolveTeamAccess } from "@/lib/auth/scope";
import {
  getWrappedStatsForPrevSeason,
  getPrevSaisonForTeam,
  WRAPPED_MIN_MATCHES,
  type WrappedStats
} from "@/lib/db/queries/wrapped";
import { getCachedStandingsForRequest } from "@/lib/recap/standings-cache";
import { eurWhole, seasonLabel } from "@/lib/recap/recap-format";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Grünes KickPact-Logo (Mark + Wortmarke) einmalig als data-URI — next/og
// (Satori) bettet lokale Assets nur als data-URI/absolute-URL zuverlässig ein.
const LOGO_GREEN =
  "data:image/png;base64," +
  readFileSync(
    join(process.cwd(), "public/brand/logo-green-horizontal.png")
  ).toString("base64");

// DB-Zugriff (postgres-js) → Node-Runtime, NICHT edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAVY = "#0F0F1E";
const ORANGE = "#FF6A30";
const RED = "#FF3127";
const LIME = "#A3E635";
const OFF = "#F8F7F4";

/**
 * 9:16-Share-Bild pro Wrapped-Slide (W4) — auth-gated (kein öffentlicher Leak
 * von Namen/Summen), der Nutzer teilt die PNG-Datei selbst.
 */
const SLIDE_KEYS = [
  "intro",
  "bilanz",
  "tabellenplatz",
  "tore",
  "torschuetze",
  "ligatorschuetze",
  "zunull",
  "comebacks",
  "heimauswaerts",
  "hoechstersieg",
  "vstop3",
  "fairness",
  "beitraege",
  "simulation",
  "zusammenfassung"
] as const;

type SlideKey = (typeof SLIDE_KEYS)[number];

const SLIDE_ACCENTS: Record<SlideKey, string> = {
  intro: ORANGE,
  bilanz: RED,
  tabellenplatz: LIME,
  tore: LIME,
  torschuetze: ORANGE,
  ligatorschuetze: LIME,
  zunull: RED,
  comebacks: LIME,
  heimauswaerts: ORANGE,
  hoechstersieg: RED,
  vstop3: ORANGE,
  fairness: RED,
  beitraege: LIME,
  simulation: ORANGE,
  zusammenfassung: ORANGE
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ teamId: string; slide: string }> }
) {
  const { teamId, slide } = await params;
  if (!(SLIDE_KEYS as readonly string[]).includes(slide)) {
    return new Response("Not found", { status: 404 });
  }
  const slideKey = slide as SlideKey;

  const user = await requireUser();
  const access = await resolveTeamAccess(user.id, teamId, "viewer");
  if (!access.granted) return new Response("Forbidden", { status: 403 });

  // Verifizierte Voll-Saison-Tabelle best-effort dazu (gecacht); null → Wrapped
  // rechnet ehrlich aus den ausgewerteten Spielen.
  const prev = await getPrevSaisonForTeam(teamId);
  const standings = prev ? await getCachedStandingsForRequest(teamId, prev) : null;
  const stats = await getWrappedStatsForPrevSeason(teamId, standings);
  if (!stats || stats.spiele < WRAPPED_MIN_MATCHES) {
    return new Response("Not found", { status: 404 });
  }

  // Slides ohne Daten gibt es auch als Bild nicht.
  const hasData: Record<SlideKey, boolean> = {
    intro: true,
    bilanz: true,
    tabellenplatz: stats.tabellenplatz !== null,
    tore: true,
    torschuetze: !!stats.besterTorschuetze,
    ligatorschuetze: !!stats.ligaTorschuetze,
    zunull: stats.zuNull > 0,
    comebacks: stats.comebacks > 0,
    heimauswaerts: stats.heimsiege + stats.auswaertssiege > 0,
    hoechstersieg: !!stats.hoechsterSieg,
    vstop3: !!stats.vsTop3 && stats.vsTop3.spiele > 0,
    fairness: !!stats.fairness,
    beitraege: stats.beitraegeSummeCents > 0,
    simulation: (stats.simulationFallbackCents ?? 0) > 0,
    zusammenfassung: true
  };
  if (!hasData[slideKey]) return new Response("Not found", { status: 404 });

  return new ImageResponse(<WrappedCard stats={stats} slide={slideKey} />, {
    width: 1080,
    height: 1920
  });
}

/* ------------------------------------------------------------------------- */

function WrappedCard({ stats, slide }: { stats: WrappedStats; slide: SlideKey }) {
  const accent = SLIDE_ACCENTS[slide];
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
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "96px 80px"
      }}
    >
      {/* Akzent-Glow */}
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

      {/* Header */}
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
            SAISON-WRAPPED
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 34, color: "rgba(248,247,244,0.6)", fontWeight: 600 }}>
          {seasonLabel(stats.saison)}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 62,
            fontWeight: 900,
            color: OFF,
            letterSpacing: "-0.02em",
            lineHeight: 1.05
          }}
        >
          {stats.teamName}
        </div>
      </div>

      {/* Slide-Inhalt */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
          gap: 12
        }}
      >
        <SlideBody stats={stats} slide={slide} accent={accent} />
      </div>

      {/* Footer-Wordmark */}
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={LOGO_GREEN}
          width={395}
          height={52}
          alt="KickPact"
          style={{ objectFit: "contain" }}
        />
        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", fontSize: 26, color: "rgba(248,247,244,0.55)", fontWeight: 600 }}>
          Macht die Mannschaftskasse voll.
        </div>
      </div>
    </div>
  );
}

function SlideBody({
  stats,
  slide,
  accent
}: {
  stats: WrappedStats;
  slide: SlideKey;
  accent: string;
}) {
  switch (slide) {
    case "intro":
      return (
        <Block
          kicker="Euer Saison-Rückblick"
          big={`EURE SAISON ${seasonLabel(stats.saison).replace("Saison ", "")}`}
          bigSize={150}
          accent={accent}
          sub={`${stats.spiele} Spiele · ${stats.toreGeschossen} Tore · ${stats.siege} Siege`}
        />
      );
    case "bilanz":
      return (
        <Block
          kicker={`${stats.spiele} Spiele auf dem Platz`}
          big={`${stats.siege} / ${stats.unentschieden} / ${stats.niederlagen}`}
          accent={accent}
          sub="Siege / Unentschieden / Niederlagen"
        />
      );
    case "tore":
      return (
        <Block
          kicker="Vorne hat's gescheppert"
          big={String(stats.toreGeschossen)}
          accent={accent}
          sub={`Tore geballert ⚽ — und nur ${stats.toreKassiert} kassiert`}
        />
      );
    case "torschuetze":
      return (
        <Block
          kicker="Euer Knipser"
          big={stats.besterTorschuetze!.name}
          bigSize={110}
          accent={accent}
          sub={`${stats.besterTorschuetze!.tore} Tor${stats.besterTorschuetze!.tore === 1 ? "" : "e"} in ${stats.detailMatchCount} ausgewerteten Spielen`}
        />
      );
    case "zunull":
      return (
        <Block
          kicker="Hinten dicht"
          big={`${stats.zuNull}×`}
          accent={accent}
          sub="zu Null gewonnen 🧱"
        />
      );
    case "comebacks":
      return (
        <Block
          kicker="Niemals aufgeben"
          big={String(stats.comebacks)}
          accent={accent}
          sub={`Comeback-Sieg${stats.comebacks === 1 ? "" : "e"} — hinten gelegen, Spiel gedreht 🔥`}
        />
      );
    case "heimauswaerts":
      return (
        <Block
          kicker="Heim & Auswärts"
          big={`${stats.heimsiege} · ${stats.auswaertssiege}`}
          accent={accent}
          sub="Heimsiege · Auswärtssiege"
        />
      );
    case "hoechstersieg":
      return (
        <Block
          kicker="Euer höchster Sieg"
          big={stats.hoechsterSieg!.ergebnis}
          accent={accent}
          sub={`${stats.hoechsterSieg!.heimName} vs ${stats.hoechsterSieg!.gastName}`}
        />
      );
    case "tabellenplatz":
      return (
        <Block
          kicker="In der Tabelle"
          big={`Platz ${stats.tabellenplatz}`}
          bigSize={140}
          accent={accent}
          sub={`von ${stats.teamsInLeague} Teams · ${stats.punkte} Punkte`}
        />
      );
    case "vstop3":
      return (
        <Block
          kicker="Gegen die Top 3"
          big={`${stats.vsTop3!.siege}/${stats.vsTop3!.unentschieden}/${stats.vsTop3!.niederlagen}`}
          accent={accent}
          sub={`S/U/N gegen die Spitze · aus ${stats.vsTop3!.spiele} Spielen`}
        />
      );
    case "ligatorschuetze":
      return (
        <Block
          kicker={`${stats.ligaTorschuetze!.name} · in der ganzen Liga`}
          big={`Nr. ${stats.ligaTorschuetze!.ligaPlatz}`}
          bigSize={140}
          accent={accent}
          sub={`der Liga-Torschützen · ${stats.ligaTorschuetze!.tore} Tore ⚽`}
        />
      );
    case "fairness":
      return (
        <Block
          kicker="Fairnesstabelle"
          big={`Platz ${stats.fairness!.platz}`}
          bigSize={140}
          accent={accent}
          sub={`von ${stats.fairness!.teamsInLeague} · ${stats.fairness!.gelb} Gelbe${stats.fairness!.rot > 0 ? `, ${stats.fairness!.rot} Rote` : ""}`}
        />
      );
    case "beitraege":
      return (
        <Block
          kicker="Eure Sponsoren"
          big={eurWhole(stats.beitraegeSummeCents)}
          accent={accent}
          sub={`beigesteuert 🧡 — über ${stats.pactsCount} Pact${stats.pactsCount === 1 ? "" : "s"}`}
        />
      );
    case "simulation":
      return (
        <Block
          kicker="Mal kurz träumen"
          big={eurWhole(stats.simulationFallbackCents ?? 0)}
          accent={accent}
          sub="hätte ein 1-€-pro-Tor-Pact letzte Saison gebracht 👀"
        />
      );
    case "zusammenfassung":
      return <SummaryBody stats={stats} accent={accent} />;
  }
}

/** Zusammenfassungs-Slide: mehrere Kern-Stats als Kachel-Grid (Spotify-Wrapped-Style). */
function SummaryBody({ stats, accent }: { stats: WrappedStats; accent: string }) {
  const tiles: Array<{ label: string; value: string; sub: string }> = [
    {
      label: "Bilanz",
      value: `${stats.siege} · ${stats.unentschieden} · ${stats.niederlagen}`,
      sub: "Siege · Unent. · Nied."
    },
    {
      label: "Tore",
      value: `${stats.toreGeschossen} : ${stats.toreKassiert}`,
      sub: "geschossen : kassiert"
    }
  ];
  if (stats.tabellenplatz !== null) {
    tiles.push({
      label: "Tabelle",
      value: `Platz ${stats.tabellenplatz}`,
      sub: stats.teamsInLeague ? `von ${stats.teamsInLeague} Teams` : "in der Liga"
    });
  }
  if (stats.besterTorschuetze) {
    const parts = stats.besterTorschuetze.name.trim().split(" ");
    tiles.push({
      label: "Knipser",
      value: parts[parts.length - 1] || stats.besterTorschuetze.name,
      sub: `${stats.besterTorschuetze.tore} Tor${stats.besterTorschuetze.tore === 1 ? "" : "e"} ⚽`
    });
  }
  const moneyCents =
    stats.beitraegeSummeCents > 0
      ? stats.beitraegeSummeCents
      : stats.simulationFallbackCents ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div
        style={{
          display: "flex",
          fontSize: 34,
          color: accent,
          fontWeight: 800,
          letterSpacing: "0.16em",
          textTransform: "uppercase"
        }}
      >
        Die ganze Saison auf einen Blick
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
        {tiles.map((t) => (
          <div
            key={t.label}
            style={{
              display: "flex",
              flexDirection: "column",
              width: 436,
              gap: 8,
              padding: "32px 36px",
              borderRadius: 28,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)"
            }}
          >
            <div
              style={{
                display: "flex",
                fontSize: 26,
                color: "rgba(248,247,244,0.5)",
                fontWeight: 700,
                letterSpacing: "0.14em",
                textTransform: "uppercase"
              }}
            >
              {t.label}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 72,
                fontWeight: 900,
                color: accent,
                letterSpacing: "-0.02em",
                lineHeight: 1.0
              }}
            >
              {t.value}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 28,
                color: "rgba(248,247,244,0.6)",
                fontWeight: 600
              }}
            >
              {t.sub}
            </div>
          </div>
        ))}
      </div>
      {moneyCents > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "28px 36px",
            borderRadius: 28,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)"
          }}
        >
          <div style={{ display: "flex", fontSize: 60, fontWeight: 900, color: OFF }}>
            {eurWhole(moneyCents)}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 30,
              color: "rgba(248,247,244,0.6)",
              fontWeight: 600
            }}
          >
            {stats.beitraegeSummeCents > 0
              ? "in die Mannschaftskasse 💰"
              : "wären drin gewesen 💰"}
          </div>
        </div>
      )}
    </div>
  );
}

function Block({
  kicker,
  big,
  sub,
  accent,
  bigSize = 200
}: {
  kicker: string;
  big: string;
  sub: string;
  accent: string;
  bigSize?: number;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          display: "flex",
          fontSize: 34,
          color: accent,
          fontWeight: 800,
          letterSpacing: "0.16em",
          textTransform: "uppercase"
        }}
      >
        {kicker}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: bigSize,
          fontWeight: 900,
          color: OFF,
          letterSpacing: "-0.03em",
          lineHeight: 1.02
        }}
      >
        {big}
      </div>
      <div style={{ display: "flex", fontSize: 38, color: "rgba(248,247,244,0.7)", fontWeight: 600 }}>
        {sub}
      </div>
    </div>
  );
}
