import { describe, it, expect, beforeEach, vi } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, clubs, teams, sponsorInvitations } from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";

// Sponsoren-Gate (Design 2026-05-29 §3.5/§6): Sponsoren dürfen erst eingeladen
// werden, wenn der Container-Verein DER MANNSCHAFT verifiziert ist
// (teams.clubId → clubs.verifiedAt) — nicht der Slug-Verein. Die Server-Action
// ist die autoritative Sperre; assertClubWriteAccess (Auth) wird gemockt,
// die DB-Auflösung läuft gegen die echte Test-DB.

const { assertClubWriteAccessMock } = vi.hoisted(() => ({
  assertClubWriteAccessMock: vi.fn()
}));

vi.mock("@/lib/auth/scope", () => ({
  assertClubWriteAccess: assertClubWriteAccessMock
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

import { createInvitationAction } from "@/app/(verein)/verein/[slug]/sponsoren/_actions/invitations";

interface Seed {
  slug: string;
  teamId: string;
  userId: string;
  clubId: string;
}

/**
 * Legt User + Container-Verein + Mannschaft an. `verified` steuert, ob der
 * Container-Verein verifiziert ist (clubs.verifiedAt gesetzt).
 */
async function seed(verified: boolean): Promise<Seed> {
  const userId = createId();
  await db.insert(users).values({
    id: userId,
    email: `t-${userId}@kickpact.local`,
    emailVerified: true,
    name: "Trainer",
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const clubId = createId();
  const slug = `c-${clubId.slice(0, 6)}`;
  await db.insert(clubs).values({
    id: clubId,
    slug,
    name: "FC Test",
    verifiedAt: verified ? new Date() : null
  });

  const teamId = createId();
  await db.insert(teams).values({
    id: teamId,
    clubId,
    name: "Herren 1",
    saison: "2526"
  });

  return { slug, teamId, userId, clubId };
}

describe("Sponsoren-Invite-Gate", () => {
  beforeEach(async () => {
    await resetTestDb();
    assertClubWriteAccessMock.mockReset();
  });

  it("blockt Invite, wenn Container-Verein der Mannschaft NICHT verifiziert ist", async () => {
    const s = await seed(false);
    assertClubWriteAccessMock.mockResolvedValue({ user: { id: s.userId } });

    await expect(
      createInvitationAction({ clubSlug: s.slug, teamId: s.teamId })
    ).rejects.toThrow(/zuerst den Verein verifizieren/i);

    const invs = await db
      .select()
      .from(sponsorInvitations)
      .where(eq(sponsorInvitations.teamId, s.teamId));
    expect(invs).toHaveLength(0);
  });

  it("erlaubt Invite, wenn Container-Verein der Mannschaft verifiziert ist", async () => {
    const s = await seed(true);
    assertClubWriteAccessMock.mockResolvedValue({ user: { id: s.userId } });

    const res = await createInvitationAction({ clubSlug: s.slug, teamId: s.teamId });
    expect(res.token).toBeTruthy();

    const invs = await db
      .select()
      .from(sponsorInvitations)
      .where(eq(sponsorInvitations.teamId, s.teamId));
    expect(invs).toHaveLength(1);
    expect(invs[0].kind).toBe("sponsor");
  });

  it("löst das Gate über den Container der Mannschaft auf (nicht über den Slug-Verein)", async () => {
    // Team hängt in einem VERIFIZIERTEN Container, dessen Slug aber NICHT der
    // übergebene clubSlug ist. Die Auth-Schicht (gemockt) erlaubt den Zugriff;
    // das Gate muss am Container des Teams hängen → Invite erlaubt.
    const s = await seed(true);
    const fremderSlug = `other-${createId().slice(0, 6)}`;
    assertClubWriteAccessMock.mockResolvedValue({ user: { id: s.userId } });

    const res = await createInvitationAction({
      clubSlug: fremderSlug,
      teamId: s.teamId
    });
    expect(res.token).toBeTruthy();

    // Gegenprobe: unverifizierter Container → Block trotz "ok" der Auth-Schicht.
    const unverified = await seed(false);
    assertClubWriteAccessMock.mockResolvedValue({ user: { id: unverified.userId } });
    await expect(
      createInvitationAction({ clubSlug: unverified.slug, teamId: unverified.teamId })
    ).rejects.toThrow(/zuerst den Verein verifizieren/i);
  });
});
