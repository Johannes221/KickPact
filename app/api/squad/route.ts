import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { findInvitationByToken } from "@/lib/db/queries/invitations";
import { getKader } from "@/lib/crawler/fussballde";
import { getTeamScorerNames } from "@/lib/db/queries/matches";
import { requireUser } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  // Auth-Gate: nur eingeloggte User dürfen Spielerlisten ziehen.
  // Vorher war das öffentlich (nur Token-Check) → Spielerdaten-Leak via
  // geleakter Mail/Browser-History (Audit 2026-05-24, CRITICAL).
  await requireUser();

  const token = req.nextUrl.searchParams.get("invitationToken");
  if (!token) {
    return NextResponse.json({ error: "invitationToken required" }, { status: 400 });
  }

  // findInvitationByToken filtert intern auf status='pending' + expiresAt > now,
  // d.h. used/revoked/expired Tokens → null → 410 Gone.
  const invitation = await findInvitationByToken(token);
  if (!invitation) {
    return NextResponse.json(
      { error: "Invitation expired or already used" },
      { status: 410 }
    );
  }

  // invitation.teamId ist nullable (team-member-Invites haben evtl. nur clubId).
  // /api/squad gibt nur Sinn für sponsor-Invites mit teamId — sonst leere Liste.
  if (!invitation.teamId) {
    return NextResponse.json({ players: [] });
  }

  const teamId = invitation.teamId;
  const [team] = await db
    .select({
      fussballdeTeamId: teams.fussballdeTeamId,
      fussballdeSlug: teams.fussballdeSlug
    })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);

  // 1) Live-Kader von fussball.de versuchen (frischeste, vollständigste Liste).
  //    `.trim()` filtert die Whitespace-only-Namen raus, die der Crawler bei
  //    manchen Teams liefert (E2E-Finding 2026-06-01: ~50 leere Dropdown-Einträge).
  let players: string[] = [];
  if (team?.fussballdeTeamId && team?.fussballdeSlug) {
    // Determine current season: e.g. today=May 2026 → saison "2526"
    const now = new Date();
    const saison =
      now.getMonth() >= 6
        ? `${String(now.getFullYear()).slice(2)}${String(now.getFullYear() + 1).slice(2)}`
        : `${String(now.getFullYear() - 1).slice(2)}${String(now.getFullYear()).slice(2)}`;
    try {
      const kader = await getKader(team.fussballdeTeamId, team.fussballdeSlug, saison);
      players = kader.map((p) => p.name?.trim() ?? "").filter((n) => n.length > 0);
    } catch {
      // Scraping failed — fall through to the match-events fallback below.
      players = [];
    }
  }

  // 2) Fallback: eigene Torschützen aus den gescrapten match_events. Greift, wenn
  //    der Live-Kader leer/whitespace ist oder das Team keine fussball.de-IDs hat.
  if (players.length === 0) {
    players = await getTeamScorerNames(teamId);
  }

  return NextResponse.json({ players });
}
