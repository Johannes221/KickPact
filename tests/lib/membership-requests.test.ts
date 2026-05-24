import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  teams,
  clubMemberships,
  teamMemberships,
  clubMembershipRequests
} from "@/lib/db/schema";
import {
  createRequest,
  listPendingRequestsForClub,
  getRequestById,
  approveRequest,
  rejectRequest
} from "@/lib/db/queries/membership-requests";
import { resetTestDb } from "../setup/db";

async function seedUser(suffix: string): Promise<string> {
  const id = createId();
  await db.insert(users).values({
    id,
    email: `u-${suffix}-${id}@kickpact.local`,
    emailVerified: true,
    name: `User ${suffix}`,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  return id;
}

async function seedClubWithTeam(hint: string) {
  const clubId = createId();
  const teamId = createId();
  await db.insert(clubs).values({
    id: clubId,
    slug: `${hint}-${clubId.slice(0, 6)}`,
    name: `Club ${hint}`
  });
  await db.insert(teams).values({
    id: teamId,
    clubId,
    name: "1. Herren",
    saison: "2526"
  });
  return { clubId, teamId };
}

describe("membership-requests queries", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("createRequest inserts a pending club-wide request", async () => {
    const userId = await seedUser("req");
    const { clubId } = await seedClubWithTeam("a");

    const req = await createRequest({
      userId,
      clubId,
      requestedRole: "trainer",
      requestedTeamId: null,
      message: "Bin der neue Co-Trainer"
    });

    expect(req.status).toBe("pending");
    expect(req.requestedRole).toBe("trainer");
    expect(req.requestedTeamId).toBeNull();
    expect(req.message).toBe("Bin der neue Co-Trainer");
  });

  it("createRequest inserts a team-scoped request", async () => {
    const userId = await seedUser("req");
    const { clubId, teamId } = await seedClubWithTeam("b");

    const req = await createRequest({
      userId,
      clubId,
      requestedRole: "trainer",
      requestedTeamId: teamId,
      message: null
    });

    expect(req.requestedTeamId).toBe(teamId);
  });

  it("createRequest throws on duplicate pending request for the same scope", async () => {
    const userId = await seedUser("dup");
    const { clubId } = await seedClubWithTeam("c");

    await createRequest({
      userId, clubId, requestedRole: "trainer", requestedTeamId: null, message: null
    });
    await expect(
      createRequest({
        userId, clubId, requestedRole: "viewer", requestedTeamId: null, message: null
      })
    ).rejects.toThrow();
  });

  it("listPendingRequestsForClub returns only pending requests with requester email", async () => {
    const userA = await seedUser("a");
    const userB = await seedUser("b");
    const { clubId } = await seedClubWithTeam("list");

    await createRequest({ userId: userA, clubId, requestedRole: "trainer", requestedTeamId: null, message: "A" });
    const reqB = await createRequest({ userId: userB, clubId, requestedRole: "viewer", requestedTeamId: null, message: "B" });

    // Resolve B so only A is pending
    await rejectRequest({ requestId: reqB.id, respondedByUserId: userA, reason: "nope" });

    const rows = await listPendingRequestsForClub(clubId);
    expect(rows).toHaveLength(1);
    expect(rows[0].message).toBe("A");
    expect(rows[0].requesterEmail).toMatch(/u-a-/);
    expect(rows[0].requestedTeamName).toBeNull();
  });

  it("listPendingRequestsForClub includes requestedTeamName when team-scoped", async () => {
    const userId = await seedUser("teamreq");
    const { clubId, teamId } = await seedClubWithTeam("teamlist");

    await createRequest({ userId, clubId, requestedRole: "trainer", requestedTeamId: teamId, message: null });

    const rows = await listPendingRequestsForClub(clubId);
    expect(rows).toHaveLength(1);
    expect(rows[0].requestedTeamName).toBe("1. Herren");
  });

  it("approveRequest (club-wide) inserts clubMembership row + marks request approved", async () => {
    const requesterId = await seedUser("rq");
    const adminId = await seedUser("admin");
    const { clubId } = await seedClubWithTeam("appr");

    const req = await createRequest({
      userId: requesterId, clubId, requestedRole: "trainer", requestedTeamId: null, message: null
    });

    await approveRequest({ requestId: req.id, respondedByUserId: adminId });

    const [mem] = await db
      .select()
      .from(clubMemberships)
      .where(eq(clubMemberships.userId, requesterId));
    expect(mem).toBeDefined();
    expect(mem.role).toBe("trainer");

    const updated = await getRequestById(req.id);
    expect(updated?.status).toBe("approved");
    expect(updated?.respondedByUserId).toBe(adminId);
  });

  it("approveRequest (team-scoped, role=trainer) inserts teamMembership row", async () => {
    const requesterId = await seedUser("rqt");
    const adminId = await seedUser("admt");
    const { clubId, teamId } = await seedClubWithTeam("apprteam");

    const req = await createRequest({
      userId: requesterId, clubId, requestedRole: "trainer", requestedTeamId: teamId, message: null
    });

    await approveRequest({ requestId: req.id, respondedByUserId: adminId });

    const [tmem] = await db
      .select()
      .from(teamMemberships)
      .where(eq(teamMemberships.userId, requesterId));
    expect(tmem).toBeDefined();
    expect(tmem.teamId).toBe(teamId);
    expect(tmem.role).toBe("trainer");

    // No club-wide membership created
    const clubMems = await db
      .select()
      .from(clubMemberships)
      .where(eq(clubMemberships.userId, requesterId));
    expect(clubMems).toHaveLength(0);
  });

  it("approveRequest (team-scoped, role=admin) downgrades to team-trainer at team level", async () => {
    const requesterId = await seedUser("rqta");
    const adminId = await seedUser("admta");
    const { clubId, teamId } = await seedClubWithTeam("apprteamadm");

    const req = await createRequest({
      userId: requesterId, clubId, requestedRole: "admin", requestedTeamId: teamId, message: null
    });

    await approveRequest({ requestId: req.id, respondedByUserId: adminId });

    const [tmem] = await db
      .select()
      .from(teamMemberships)
      .where(eq(teamMemberships.userId, requesterId));
    expect(tmem.role).toBe("trainer"); // admin doesn't exist at team level; maps to trainer
  });

  it("rejectRequest marks request rejected and stores reason; no membership row created", async () => {
    const requesterId = await seedUser("rj");
    const adminId = await seedUser("rja");
    const { clubId } = await seedClubWithTeam("rej");

    const req = await createRequest({
      userId: requesterId, clubId, requestedRole: "trainer", requestedTeamId: null, message: null
    });

    await rejectRequest({ requestId: req.id, respondedByUserId: adminId, reason: "Brauchen wir nicht" });

    const updated = await getRequestById(req.id);
    expect(updated?.status).toBe("rejected");
    expect(updated?.responseMessage).toBe("Brauchen wir nicht");

    const clubMems = await db
      .select()
      .from(clubMemberships)
      .where(eq(clubMemberships.userId, requesterId));
    expect(clubMems).toHaveLength(0);
  });
});
