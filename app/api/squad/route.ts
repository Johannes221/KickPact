import { NextRequest, NextResponse } from "next/server";
import { findInvitationByToken } from "@/lib/db/queries/invitations";
import { getTeamPlayerPool } from "@/lib/db/queries/matches";
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

  // Vollständige Liste rein aus der DB (Kader ∪ alle Auftritte) — kein
  // Live-Scrape mehr. Schnell genug, um beim Mount des Pact-Builders vorgeladen
  // zu werden, und nicht mehr durch fussball.de-Tofu/Captcha blockiert.
  const players = await getTeamPlayerPool(invitation.teamId);
  return NextResponse.json({ players });
}
