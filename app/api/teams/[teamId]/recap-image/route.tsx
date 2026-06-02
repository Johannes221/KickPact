import { ImageResponse } from "next/og";
import { requireUser } from "@/lib/auth/session";
import { resolveTeamAccess } from "@/lib/auth/scope";
import {
  getTeamSeasonRecapStats,
  type TeamSeasonRecap
} from "@/lib/db/queries/team-season-recap";
import { eurWhole, triggerLabel, seasonLabel } from "@/lib/recap/recap-format";

// DB-Zugriff (postgres-js) → Node-Runtime, NICHT edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NAVY = "#0F0F1E";
const GREEN = "#01C457";
const ORANGE = "#FF4500";
const OFF = "#F8F7F4";

/**
 * 9:16 "Spotify-Wrapped"-Standbild für die Saison einer Mannschaft.
 * Auth-gated (kein öffentlicher URL-Leak des Top-Sponsor-Namens) — der Nutzer
 * lädt das PNG herunter und teilt die Datei.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const user = await requireUser();
  const access = await resolveTeamAccess(user.id, teamId, "viewer");
  if (!access.granted) return new Response("Forbidden", { status: 403 });

  const stats = await getTeamSeasonRecapStats(teamId);
  if (!stats) return new Response("Not found", { status: 404 });

  return new ImageResponse(<RecapCard stats={stats} />, {
    width: 1080,
    height: 1920
  });
}

function RecapCard({ stats }: { stats: TeamSeasonRecap }) {
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
      {/* Accent glows */}
      <div
        style={{
          position: "absolute",
          top: -160,
          right: -160,
          width: 620,
          height: 620,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255,69,0,0.22) 0%, rgba(255,69,0,0) 70%)"
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -120,
          left: -120,
          width: 520,
          height: 520,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(1,196,87,0.16) 0%, rgba(1,196,87,0) 70%)"
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 10,
          background: "linear-gradient(to right, #FF4500, #FF6A30, #01C457)"
        }}
      />

      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex" }}>
          <div
            style={{
              background: "rgba(1,196,87,0.15)",
              border: "1px solid rgba(1,196,87,0.35)",
              borderRadius: 24,
              padding: "10px 24px",
              color: GREEN,
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: "0.18em"
            }}
          >
            SAISON-RECAP
          </div>
        </div>
        <div style={{ display: "flex", fontSize: 34, color: "rgba(248,247,244,0.6)", fontWeight: 600 }}>
          {seasonLabel(stats.saison)}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 68,
            fontWeight: 900,
            color: OFF,
            letterSpacing: "-0.02em",
            lineHeight: 1.05
          }}
        >
          {stats.teamName}
        </div>
      </div>

      {/* Hero — total raised */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 88,
          gap: 8
        }}
      >
        <div style={{ display: "flex", fontSize: 36, color: "rgba(248,247,244,0.6)", fontWeight: 600 }}>
          So viel hat eure Mannschaft erspielt
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 200,
            fontWeight: 900,
            color: GREEN,
            letterSpacing: "-0.04em",
            lineHeight: 1
          }}
        >
          {eurWhole(stats.totalCents)}
        </div>
        <div style={{ display: "flex", fontSize: 32, color: "rgba(248,247,244,0.5)", fontWeight: 500 }}>
          aus {stats.eventCount} Spielereignissen
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 80 }}>
        {stats.topTrigger && (
          <StatRow
            label="Häufigstes Ereignis"
            value={`${triggerLabel(stats.topTrigger.type)} · ${stats.topTrigger.count}×`}
          />
        )}
        {stats.topSponsor && (
          <StatRow
            label="Top-Sponsor"
            value={`${stats.topSponsor.name} · ${eurWhole(stats.topSponsor.cents)}`}
            accent
          />
        )}
        {stats.biggest && stats.biggest.cents > 0 && (
          <StatRow
            label="Geilster Moment"
            value={`${eurWhole(stats.biggest.cents)} · ${triggerLabel(stats.biggest.type)}`}
          />
        )}
      </div>

      {/* Footer — wordmark */}
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
        <div style={{ display: "flex", fontSize: 52, fontWeight: 900, color: OFF, letterSpacing: "-0.03em" }}>
          Kick<span style={{ color: ORANGE }}>Pact</span>
        </div>
        <div style={{ display: "flex", flex: 1 }} />
        <div style={{ display: "flex", fontSize: 26, color: "rgba(248,247,244,0.55)", fontWeight: 600 }}>
          Macht die Mannschaftskasse voll.
        </div>
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
  accent
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        background: accent ? "rgba(255,69,0,0.10)" : "rgba(248,247,244,0.05)",
        border: `1px solid ${accent ? "rgba(255,69,0,0.30)" : "rgba(248,247,244,0.12)"}`,
        borderRadius: 24,
        padding: "28px 36px"
      }}
    >
      <div style={{ display: "flex", fontSize: 26, color: "rgba(248,247,244,0.5)", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ display: "flex", fontSize: 48, color: OFF, fontWeight: 800, letterSpacing: "-0.01em" }}>
        {value}
      </div>
    </div>
  );
}
