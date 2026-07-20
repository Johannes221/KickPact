import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Welcher Commit läuft hier gerade? Beantwortet die Frage „ist mein Push
 * eigentlich deployt?", die sich sonst von außen NICHT beantworten lässt — die
 * App liefert keinen Versions-Marker, und unveränderte Asset-Hashes beweisen
 * nichts. Ein Push, der nie einen Container erreicht hat, sah bisher genauso
 * aus wie ein erfolgreicher Deploy.
 *
 * Coolify muss dafür den Commit als Env durchreichen (Service → Environment
 * Variables, z.B. `SOURCE_COMMIT=$SOURCE_COMMIT`). Fehlt sie, steht hier
 * "unknown" — dann ist die Antwort ehrlich unbekannt statt falsch zuversichtlich.
 *
 * Kein Secret: der SHA eines privaten Repos gibt ohne Repo-Zugriff nichts preis
 * und ist im Störungsfall genau die Information, die man zuerst braucht.
 */
function deployedCommit(): string {
  return (
    process.env.SOURCE_COMMIT ??
    process.env.GIT_COMMIT_SHA ??
    process.env.COOLIFY_GIT_COMMIT_SHA ??
    "unknown"
  );
}

/**
 * Echter Health-Check für Coolify + Uptime-Kuma. `/status` liefert ohne Token
 * statisch „ok" OHNE DB-Zugriff — ein toter Neon-/Pool-Ausfall bliebe damit
 * unentdeckt (kein Auto-Restart, kein Alarm). Dieser Endpoint probt die DB
 * aktiv: 200 bei erreichbarer DB, 503 sonst.
 */
export async function GET() {
  const commit = deployedCommit();
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ status: "ok", commit }, { status: 200 });
  } catch (err) {
    console.error("[health] DB-Probe fehlgeschlagen", err);
    return NextResponse.json(
      { status: "error", detail: "database-unreachable", commit },
      { status: 503 }
    );
  }
}
