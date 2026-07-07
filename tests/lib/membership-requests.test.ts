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
  rejectRequest,
  changeClubMembershipRole,
  revokeClubMembership,
  changeTeamMembershipRole,
  revokeTeamMembership,
  countClubAdmins
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

  it("approveRequest (team-scoped, role=trainer) maps to team-admin", async () => {
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
    // Team-Ebene kennt nur admin|viewer; jede Nicht-viewer-Anfrage → admin.
    expect(tmem.role).toBe("admin");

    // No club-wide membership created
    const clubMems = await db
      .select()
      .from(clubMemberships)
      .where(eq(clubMemberships.userId, requesterId));
    expect(clubMems).toHaveLength(0);
  });

  it("approveRequest (team-scoped, role=admin) grants team-admin", async () => {
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
    expect(tmem.role).toBe("admin");
  });

  it("approveRequest (team-scoped, role=viewer) grants team-viewer", async () => {
    const requesterId = await seedUser("rqtv");
    const adminId = await seedUser("admtv");
    const { clubId, teamId } = await seedClubWithTeam("apprteamview");

    const req = await createRequest({
      userId: requesterId, clubId, requestedRole: "viewer", requestedTeamId: teamId, message: null
    });

    await approveRequest({ requestId: req.id, respondedByUserId: adminId });

    const [tmem] = await db
      .select()
      .from(teamMemberships)
      .where(eq(teamMemberships.userId, requesterId));
    expect(tmem.role).toBe("viewer");
  });

  it("approveRequest rejects a requestedTeamId that belongs to a FOREIGN club (cross-tenant IDOR guard)", async () => {
    const attackerId = await seedUser("atk");
    const adminId = await seedUser("victimadmin");
    const { clubId: clubX } = await seedClubWithTeam("victimclub");
    const { teamId: foreignTeam } = await seedClubWithTeam("foreignclub");

    // Forged request: scoped to club X, but pointing at a team from club Y.
    const req = await createRequest({
      userId: attackerId,
      clubId: clubX,
      requestedRole: "trainer",
      requestedTeamId: foreignTeam,
      message: null
    });

    await expect(
      approveRequest({ requestId: req.id, respondedByUserId: adminId })
    ).rejects.toThrow();

    // No team membership on the foreign team may be granted.
    const tmems = await db
      .select()
      .from(teamMemberships)
      .where(eq(teamMemberships.userId, attackerId));
    expect(tmems).toHaveLength(0);
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

describe("membership management queries", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("countClubAdmins returns the number of admin memberships", async () => {
    const adminA = await seedUser("admA");
    const adminB = await seedUser("admB");
    const trainer = await seedUser("trnX");
    const { clubId } = await seedClubWithTeam("count");

    await db.insert(clubMemberships).values({ userId: adminA, clubId, role: "admin" });
    await db.insert(clubMemberships).values({ userId: adminB, clubId, role: "admin" });
    await db.insert(clubMemberships).values({ userId: trainer, clubId, role: "trainer" });

    expect(await countClubAdmins(clubId)).toBe(2);
  });

  it("changeClubMembershipRole updates the row and returns it", async () => {
    const userId = await seedUser("chg");
    const { clubId } = await seedClubWithTeam("chgrole");
    await db.insert(clubMemberships).values({ userId, clubId, role: "viewer" });

    const updated = await changeClubMembershipRole(clubId, userId, "trainer");
    expect(updated?.role).toBe("trainer");

    const [row] = await db
      .select()
      .from(clubMemberships)
      .where(eq(clubMemberships.userId, userId));
    expect(row.role).toBe("trainer");
  });

  it("changeClubMembershipRole returns null when the membership does not exist", async () => {
    const userId = await seedUser("ghost");
    const { clubId } = await seedClubWithTeam("ghostc");

    const updated = await changeClubMembershipRole(clubId, userId, "trainer");
    expect(updated).toBeNull();
  });

  it("revokeClubMembership deletes the row", async () => {
    const userId = await seedUser("rev");
    const { clubId } = await seedClubWithTeam("revc");
    await db.insert(clubMemberships).values({ userId, clubId, role: "trainer" });

    const ok = await revokeClubMembership(clubId, userId);
    expect(ok).toBe(true);

    const rows = await db
      .select()
      .from(clubMemberships)
      .where(eq(clubMemberships.userId, userId));
    expect(rows).toHaveLength(0);
  });

  it("changeTeamMembershipRole + revokeTeamMembership work on team scope", async () => {
    const userId = await seedUser("tm");
    const { teamId } = await seedClubWithTeam("tmscope");
    await db.insert(teamMemberships).values({ userId, teamId, role: "viewer" });

    const updated = await changeTeamMembershipRole(teamId, userId, "admin");
    expect(updated?.role).toBe("admin");

    const ok = await revokeTeamMembership(teamId, userId);
    expect(ok).toBe(true);

    const rows = await db
      .select()
      .from(teamMemberships)
      .where(eq(teamMemberships.userId, userId));
    expect(rows).toHaveLength(0);
  });

  it("self-demotion guard: countClubAdmins=1 means demote / revoke must be blocked at call site", async () => {
    // This test documents the contract used by the manage.ts server actions:
    // when countClubAdmins(club.id) <= 1 and the acting user is the only admin,
    // the action must refuse to change the role or revoke. The action layer
    // owns the policy; here we just verify the building blocks behave as
    // assumed (count==1, then a change still mechanically succeeds — meaning
    // the guard MUST live in the action, not the query).
    const onlyAdmin = await seedUser("only");
    const { clubId } = await seedClubWithTeam("solo");
    await db.insert(clubMemberships).values({ userId: onlyAdmin, clubId, role: "admin" });

    expect(await countClubAdmins(clubId)).toBe(1);

    // The query itself does NOT enforce the guard — that's intentional. The
    // server action checks countClubAdmins() and refuses before calling this.
    const demoted = await changeClubMembershipRole(clubId, onlyAdmin, "viewer");
    expect(demoted?.role).toBe("viewer");
    expect(await countClubAdmins(clubId)).toBe(0);
  });
});
