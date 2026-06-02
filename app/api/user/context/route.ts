import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { findSponsorForUser } from "@/lib/db/queries/sponsor-dashboard";
import { listClubsForUser } from "@/lib/db/queries/club-admin";

export const dynamic = "force-dynamic";

/**
 * Gibt den Benutzer-Kontext zurück: Hat er ein Sponsor-Profil? Welche Vereine
 * hat er als Admin? Wird vom HeaderUserMenu genutzt um kontextspezifische
 * Navigations-Links anzuzeigen.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ hasSponsor: false, clubs: [] });
  }

  const [sponsor, clubRows] = await Promise.all([
    findSponsorForUser(session.user.id),
    listClubsForUser(session.user.id)
  ]);

  return NextResponse.json({
    hasSponsor: sponsor !== null,
    clubs: clubRows
  });
}
