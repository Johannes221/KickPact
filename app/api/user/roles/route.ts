import { NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth/session";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { listMyPendingRequests } from "@/lib/db/queries/membership-requests";
import { isPlatformAdminEmail } from "@/lib/auth/admin";

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
      { clubs: [], teamOnly: [], sponsor: null, pendingRequests: [] },
      { status: 401 }
    );
  }
  const [identities, pendingRequests, isPlatformAdmin] = await Promise.all([
    getUserIdentities(session.user.id),
    listMyPendingRequests(session.user.id),
    isPlatformAdminEmail(session.user.email)
  ]);
  return NextResponse.json({ ...identities, pendingRequests, isPlatformAdmin });
}
