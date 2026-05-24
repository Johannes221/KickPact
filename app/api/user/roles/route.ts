import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { getUserIdentities } from "@/lib/db/queries/user-identities";

export const dynamic = "force-dynamic";

/**
 * Returns the authenticated user's full identity snapshot
 * (clubs, team-only memberships, sponsor profile) for the header
 * role-switcher dropdown.
 *
 * Unauthenticated requests → 401 with an empty payload so the client
 * can fall back gracefully without throwing.
 */
export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json(
      { clubs: [], teamOnly: [], sponsor: null },
      { status: 401 }
    );
  }
  const identities = await getUserIdentities(session.user.id);
  return NextResponse.json(identities);
}
