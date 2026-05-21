import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { findInvitationByToken } from "@/lib/db/queries/invitations";
import { getKader } from "@/lib/crawler/fussballde";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("invitationToken");
  if (!token) {
    return NextResponse.json({ error: "invitationToken required" }, { status: 400 });
  }

  const invitation = await findInvitationByToken(token);
  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  const [team] = await db
    .select({
      fussballdeTeamId: teams.fussballdeTeamId,
      fussballdeSlug: teams.fussballdeSlug,
    })
    .from(teams)
    .where(eq(teams.id, invitation.teamId))
    .limit(1);

  if (!team?.fussballdeTeamId || !team?.fussballdeSlug) {
    return NextResponse.json({ players: [] });
  }

  // Determine current season: e.g. today=May 2026 → saison "2526"
  const now = new Date();
  const saison =
    now.getMonth() >= 6
      ? `${String(now.getFullYear()).slice(2)}${String(now.getFullYear() + 1).slice(2)}`
      : `${String(now.getFullYear() - 1).slice(2)}${String(now.getFullYear()).slice(2)}`;

  try {
    const kader = await getKader(team.fussballdeTeamId, team.fussballdeSlug, saison);
    const players = kader.map((p) => p.name).filter(Boolean);
    return NextResponse.json({ players });
  } catch {
    // Scraping failed — fall back to empty list (player picker shows text input)
    return NextResponse.json({ players: [] });
  }
}
