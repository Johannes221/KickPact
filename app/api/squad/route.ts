import { NextRequest, NextResponse } from "next/server";
import { findInvitationByToken } from "@/lib/db/queries/invitations";
import { getKader } from "@/lib/crawler/fussballde";
import { getTeamPlayerNames, getTeamFussballdeRef } from "@/lib/db/queries/matches";
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
  const team = await getTeamFussballdeRef(teamId);

  // Union aus zwei Quellen, damit ALLE wählbar sind, die je aufgelaufen sind
  // ODER aktuell im Kader stehen:
  //   1) Live-Kader von fussball.de (getrimmt — `.trim()` entfernt die
  //      Whitespace-only-Namen, die der Crawler bei manchen Teams liefert;
  //      E2E-Finding 2026-06-01: ~50 leere Dropdown-Einträge).
  //   2) Alle bisher aufgelaufenen Spieler aus den gescrapten match_events.
  const names = new Set<string>();

  if (team?.fussballdeTeamId && team?.fussballdeSlug) {
    // Determine current season: e.g. today=May 2026 → saison "2526"
    const now = new Date();
    const saison =
      now.getMonth() >= 6
        ? `${String(now.getFullYear()).slice(2)}${String(now.getFullYear() + 1).slice(2)}`
        : `${String(now.getFullYear() - 1).slice(2)}${String(now.getFullYear()).slice(2)}`;
    try {
      const kader = await getKader(team.fussballdeTeamId, team.fussballdeSlug, saison);
      for (const p of kader) {
        const n = p.name?.trim();
        if (n) names.add(n);
      }
    } catch {
      // Scraping failed — die match_events-Quelle unten trägt die Liste.
    }
  }

  for (const n of await getTeamPlayerNames(teamId)) names.add(n);

  const players = [...names].sort((a, b) => a.localeCompare(b, "de"));
  return NextResponse.json({ players });
}
