/**
 * E2E-Cleanup-Endpoint.
 *
 * Löscht ALLE User mit Email-Domain `e2e-test.kickpact.de` (via Test-Helper
 * `testEmail()` generierte). Kaskadiert über FK-cascade-deletes auf:
 *  - sessions
 *  - accounts
 *  - club_memberships, team_memberships, club_membership_requests
 *  - sponsor_invitations (createdByUserId / usedByUserId)
 *  - operator_audit_log-Einträge von E2E-Usern (explizit vorab gelöscht —
 *    FK ist ON DELETE RESTRICT und würde den User-Delete sonst blocken)
 *  - alle clubs, deren einziger Admin der Test-User war (wir traversieren NICHT —
 *    Cascade von users löscht NUR Foreign-Keys mit ON DELETE CASCADE).
 *
 * Streng guard-ed wie /magic-link-stub (siehe ../_lib/guard.ts):
 *  - Production-Builds: hart deaktiviert, außer ALLOW_TEST_AUTH=true
 *  - E2E_TEST_BYPASS_KEY Env muss gesetzt sein
 *  - Header `x-test-bypass: <KEY>` muss matchen
 *  - Antwort 404 wenn nicht
 *
 * POST mit beliebigem Body — wir akzeptieren auch leer.
 */
import { NextResponse, type NextRequest } from "next/server";
import { inArray, like, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema/auth";
import { clubs } from "@/lib/db/schema/clubs";
import { operatorAuditLog } from "@/lib/db/schema/system";
import { guardTestAuth } from "../_lib/guard";

const E2E_DOMAIN = "e2e-test.kickpact.de";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = guardTestAuth(req);
  if (denied) return denied;

  // 1. Lösche alle Clubs mit Slug-Präfix `e2e-` — Test-Clubs sollten so prefixed sein.
  // (Kaskadiert über clubs.id → teams, club_memberships, team_memberships, etc.)
  const deletedClubs = await db
    .delete(clubs)
    .where(like(clubs.slug, "e2e-%"))
    .returning({ id: clubs.id });

  // 2. Lösche Operator-Audit-Einträge von E2E-Usern. Der FK steht bewusst auf
  // ON DELETE RESTRICT (Audit-Log ist append-only für ECHTE Operator-Aktionen) —
  // Einträge aus Admin-E2E-Tests sind aber Testrauschen und würden sonst den
  // User-Delete in Schritt 3 mit FK-Violation (→ 500) blockieren.
  const e2eUserIds = db
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.email} LIKE ${`%@${E2E_DOMAIN}`}`);
  await db
    .delete(operatorAuditLog)
    .where(inArray(operatorAuditLog.operatorUserId, e2eUserIds));

  // 3. Lösche alle User mit @e2e-test.kickpact.de.
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
