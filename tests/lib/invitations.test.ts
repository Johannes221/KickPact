import { describe, it, expect, beforeEach } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, clubs, teams, sponsorInvitations } from "@/lib/db/schema";
import {
  createInvitation,
  findInvitationByToken,
  markInvitationUsed
} from "@/lib/db/queries/invitations";
import { resetTestDb } from "../setup/db";

async function seedTeam(): Promise<{ teamId: string; userId: string }> {
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
  await db.insert(clubs).values({
    id: clubId,
    slug: `c-${clubId.slice(0, 6)}`,
    name: "FC Test"
  });

  const teamId = createId();
  await db.insert(teams).values({
    id: teamId,
    clubId,
    name: "Herren 1",
    saison: "2526"
  });

  return { teamId, userId };
}

describe("invitations queries", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("createInvitation setzt expiresAt ~30 Tage in der Zukunft", async () => {
    const { teamId, userId } = await seedTeam();
    const before = Date.now();
    const inv = await createInvitation({ teamId, createdByUserId: userId });
    const after = Date.now();

    const lowerBound = before + 29 * 24 * 60 * 60 * 1000;
    const upperBound = after + 31 * 24 * 60 * 60 * 1000;
    expect(inv.expiresAt.getTime()).toBeGreaterThan(lowerBound);
    expect(inv.expiresAt.getTime()).toBeLessThan(upperBound);
  });

  it("findInvitationByToken liefert pending Invitations", async () => {
    const { teamId, userId } = await seedTeam();
    const inv = await createInvitation({ teamId, createdByUserId: userId });
    const found = await findInvitationByToken(inv.token);
    expect(found?.id).toBe(inv.id);
  });

  it("findInvitationByToken liefert NULL für used Invitations", async () => {
    const { teamId, userId } = await seedTeam();
    const inv = await createInvitation({ teamId, createdByUserId: userId });
    await markInvitationUsed(inv.token, userId);

    const found = await findInvitationByToken(inv.token);
    expect(found).toBeNull();
  });

  it("findInvitationByToken liefert NULL für revoked Invitations", async () => {
    const { teamId, userId } = await seedTeam();
    const inv = await createInvitation({ teamId, createdByUserId: userId });
    await db
      .update(sponsorInvitations)
      .set({ status: "revoked" })
      .where(eq(sponsorInvitations.id, inv.id));

    const found = await findInvitationByToken(inv.token);
    expect(found).toBeNull();
  });

  it("findInvitationByToken liefert NULL für abgelaufene Invitations", async () => {
    const { teamId, userId } = await seedTeam();
    const inv = await createInvitation({ teamId, createdByUserId: userId });
    // Manuell auf gestern setzen
    await db
      .update(sponsorInvitations)
      .set({ expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000) })
      .where(eq(sponsorInvitations.id, inv.id));

    const found = await findInvitationByToken(inv.token);
    expect(found).toBeNull();
  });
});
