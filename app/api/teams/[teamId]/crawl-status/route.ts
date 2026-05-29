import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matches } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/session";
import { resolveTeamAccess } from "@/lib/auth/scope";
import { getTeamCrawlState } from "@/lib/db/queries/crawler";
import { isTeamCrawling } from "@/lib/crawler/crawl-status";

// Polling-Endpoint für das „Spiele werden geladen"-Banner (siehe
// CrawlAutoRefresh-Component). Liefert minimalen Status: läuft der Crawl noch,
// und wie viele Spiele sind aktuell da (gedeckelt aufs Page-Limit, damit der
// Vergleich client-seitig nicht ewig „neue Spiele" meldet).
const MATCH_COUNT_CAP = 30;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;

  // Auth: nur Mitglieder des zugehörigen Vereins/Teams dürfen den Status sehen.
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const access = await resolveTeamAccess(session.user.id, teamId, "viewer");
  if (!access.granted) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const crawlState = await getTeamCrawlState(teamId);
  if (!crawlState) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // count(*) auf das Page-Limit deckeln: sobald Page und API beide den Cap
  // erreichen, sind sie gleich → kein Dauer-Refresh bei >30 Spielen.
  const [countRow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(
      db
        .select({ id: matches.id })
        .from(matches)
        .where(eq(matches.teamId, teamId))
        .limit(MATCH_COUNT_CAP)
        .as("capped")
    );

  return NextResponse.json(
    {
      isCrawling: isTeamCrawling(crawlState.crawlStartedAt, crawlState.crawlCompletedAt),
      matchCount: Number(countRow?.n ?? 0)
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
