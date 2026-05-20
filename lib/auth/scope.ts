import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubMemberships, clubs } from "@/lib/db/schema";
import { requireUser } from "./session";
import {
  getSubscriptionGate,
  type SubscriptionGate
} from "@/lib/db/queries/subscription-status";

type Role = "admin" | "trainer" | "viewer";
const ROLE_RANK: Record<Role, number> = { viewer: 1, trainer: 2, admin: 3 };

export async function assertClubAccess(clubSlug: string, minRole: Role = "viewer") {
  const user = await requireUser();
  const [club] = await db
    .select({ id: clubs.id, slug: clubs.slug, name: clubs.name })
    .from(clubs)
    .where(eq(clubs.slug, clubSlug))
    .limit(1);
  if (!club) throw new Error(`Club ${clubSlug} not found`);

  const [membership] = await db
    .select({ role: clubMemberships.role })
    .from(clubMemberships)
    .where(
      and(eq(clubMemberships.userId, user.id), eq(clubMemberships.clubId, club.id))
    )
    .limit(1);

  if (!membership) {
    throw new Error("Forbidden: not a club member");
  }
  if (ROLE_RANK[membership.role] < ROLE_RANK[minRole]) {
    throw new Error(`Forbidden: requires ${minRole}`);
  }

  return { user, club, role: membership.role };
}

export type ClubWriteAccess = Awaited<ReturnType<typeof assertClubAccess>> & {
  gate: SubscriptionGate;
};

/**
 * Wie `assertClubAccess`, blockt aber zusätzlich Schreiboperationen wenn der
 * Verein im Read-Only-Modus ist (past_due > 7d Grace oder cancelled / incomplete).
 *
 * Lesende Server-Actions sollten weiter `assertClubAccess` verwenden, damit das
 * Vereins-Dashboard im Read-Only-Modus weiter sichtbar bleibt.
 */
export async function assertClubWriteAccess(
  clubSlug: string,
  minRole: Role = "trainer"
): Promise<ClubWriteAccess> {
  const ctx = await assertClubAccess(clubSlug, minRole);
  const gate = await getSubscriptionGate(ctx.club.id);
  if (gate.isReadOnly) {
    throw new Error(
      "Diese Mannschaft ist im Read-Only-Modus. Bitte Abo reaktivieren."
    );
  }
  return { ...ctx, gate };
}
