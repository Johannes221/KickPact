/**
 * E2E-Cleanup-Endpoint.
 *
 * Löscht ALLE User mit Email-Domain `e2e-test.kickpact.de` (via Test-Helper
 * `testEmail()` generierte). Kaskadiert über FK-cascade-deletes auf:
 *  - sessions
 *  - accounts
 *  - club_memberships, team_memberships, club_membership_requests
 *  - sponsor_invitations (createdByUserId / usedByUserId)
 *  - alle clubs, deren einziger Admin der Test-User war (wir traversieren NICHT —
 *    Cascade von users löscht NUR Foreign-Keys mit ON DELETE CASCADE).
 *
 * Streng guard-ed wie /magic-link-stub:
 *  - E2E_TEST_BYPASS_KEY Env muss gesetzt sein
 *  - Header `x-test-bypass: <KEY>` muss matchen
 *  - Antwort 404 wenn nicht
 *
 * POST mit beliebigem Body — wir akzeptieren auch leer.
 */
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { like, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema/auth";
import { clubs } from "@/lib/db/schema/clubs";

const E2E_DOMAIN = "e2e-test.kickpact.de";

function constantTimeMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
  } catch {
    return false;
  }
}

function notFound(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.E2E_TEST_BYPASS_KEY;
  if (!expected) return notFound();

  const provided = req.headers.get("x-test-bypass");
  if (!provided || !constantTimeMatch(provided, expected)) return notFound();

  // 1. Lösche alle Clubs mit Slug-Präfix `e2e-` — Test-Clubs sollten so prefixed sein.
  // (Kaskadiert über clubs.id → teams, club_memberships, team_memberships, etc.)
  const deletedClubs = await db
    .delete(clubs)
    .where(like(clubs.slug, "e2e-%"))
    .returning({ id: clubs.id });

  // 2. Lösche alle User mit @e2e-test.kickpact.de.
  // Cascade löscht ihre Sessions, Memberships, etc.
  const deletedUsers = await db
    .delete(users)
    .where(sql`${users.email} LIKE ${`%@${E2E_DOMAIN}`}`)
    .returning({ id: users.id, email: users.email });

  return NextResponse.json({
    deletedUsers: deletedUsers.length,
    deletedClubs: deletedClubs.length
  });
}
