import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Echter Health-Check für Coolify + Uptime-Kuma. `/status` liefert ohne Token
 * statisch „ok" OHNE DB-Zugriff — ein toter Neon-/Pool-Ausfall bliebe damit
 * unentdeckt (kein Auto-Restart, kein Alarm). Dieser Endpoint probt die DB
 * aktiv: 200 bei erreichbarer DB, 503 sonst.
 */
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (err) {
    console.error("[health] DB-Probe fehlgeschlagen", err);
    return NextResponse.json(
      { status: "error", detail: "database-unreachable" },
      { status: 503 }
    );
  }
}
