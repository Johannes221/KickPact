import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sponsors, clubMemberships, clubs } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/session";

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

  const [sponsorRow, clubRows] = await Promise.all([
    db
      .select({ id: sponsors.id })
      .from(sponsors)
      .where(eq(sponsors.userId, session.user.id))
      .limit(1),
    db
      .select({ slug: clubs.slug, name: clubs.name })
      .from(clubMemberships)
      .innerJoin(clubs, eq(clubMemberships.clubId, clubs.id))
      .where(eq(clubMemberships.userId, session.user.id))
  ]);

  return NextResponse.json({
    hasSponsor: sponsorRow.length > 0,
    clubs: clubRows
  });
}
