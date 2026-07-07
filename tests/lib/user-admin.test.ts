import { beforeEach, describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  clubMemberships,
  sessions,
  teams,
  supportTickets,
  sponsorInquiries
} from "@/lib/db/schema";
import {
  updateUserProfile,
  setUserDeletionRequested,
  anonymizeUserAccount,
  setClubMembershipRole,
  removeClubMembership,
  DELETED_NAME
} from "@/lib/db/queries/user-admin";
import { resetTestDb } from "../setup/db";
import { isIntegrationDbDisabled } from "../setup/integration-db";

async function makeUser(email: string): Promise<string> {
  const id = createId();
  await db.insert(users).values({ id, email: email.toLowerCase(), emailVerified: true, name: "U" });
  return id;
}

async function makeClub(): Promise<string> {
  const id = createId();
  await db.insert(clubs).values({ id, slug: `c-${id.slice(0, 6)}`, name: "Club", logoUrl: null });
  return id;
}

async function makeTeam(clubId: string): Promise<string> {
  const id = createId();
  await db.insert(teams).values({ id, clubId, name: "Team", saison: "2526" });
  return id;
}

describe.skipIf(isIntegrationDbDisabled)("user-admin queries", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("updates profile and rejects a taken email", async () => {
    const a = await makeUser("a@example.de");
    await makeUser("b@example.de");

    const ok = await updateUserProfile({ userId: a, name: "Neu", email: "Anew@Example.de" });
    expect(ok.ok).toBe(true);
    const [row] = await db.select().from(users).where(eq(users.id, a));
    expect(row.email).toBe("anew@example.de");
    expect(row.name).toBe("Neu");

    const taken = await updateUserProfile({ userId: a, name: "Neu", email: "b@example.de" });
    expect(taken.ok).toBe(false);
    expect(taken.error).toBe("email_taken");
  });

  it("changes a club role for ONLY the target user", async () => {
    const u1 = await makeUser("u1@example.de");
    const u2 = await makeUser("u2@example.de");
    const club = await makeClub();
    await db.insert(clubMemberships).values({ userId: u1, clubId: club, role: "admin" });
    await db.insert(clubMemberships).values({ userId: u2, clubId: club, role: "admin" });

    await setClubMembershipRole({ userId: u1, clubId: club, role: "viewer" });

    const [m1] = await db
      .select()
      .from(clubMemberships)
      .where(and(eq(clubMemberships.userId, u1), eq(clubMemberships.clubId, club)));
    const [m2] = await db
      .select()
      .from(clubMemberships)
      .where(and(eq(clubMemberships.userId, u2), eq(clubMemberships.clubId, club)));
    expect(m1.role).toBe("viewer");
    expect(m2.role).toBe("admin"); // unverändert — Isolation
  });

  it("removes only the target user's membership", async () => {
    const u1 = await makeUser("r1@example.de");
    const u2 = await makeUser("r2@example.de");
    const club = await makeClub();
    await db.insert(clubMemberships).values({ userId: u1, clubId: club, role: "admin" });
    await db.insert(clubMemberships).values({ userId: u2, clubId: club, role: "viewer" });

    await removeClubMembership({ userId: u1, clubId: club });

    const remaining = await db
      .select()
      .from(clubMemberships)
      .where(eq(clubMemberships.clubId, club));
    expect(remaining).toHaveLength(1);
    expect(remaining[0].userId).toBe(u2);
  });

  it("sets and clears the deletion request", async () => {
    const u = await makeUser("d@example.de");
    await setUserDeletionRequested({ userId: u, requested: true });
    let [row] = await db.select().from(users).where(eq(users.id, u));
    expect(row.deletionRequestedAt).not.toBeNull();
    await setUserDeletionRequested({ userId: u, requested: false });
    [row] = await db.select().from(users).where(eq(users.id, u));
    expect(row.deletionRequestedAt).toBeNull();
  });

  it("anonymizes: tombstones email/name and removes sessions", async () => {
    const u = await makeUser("anon@example.de");
    await db.insert(sessions).values({
      id: createId(),
      userId: u,
      token: createId(),
      expiresAt: new Date(Date.now() + 3600_000)
    });

    await anonymizeUserAccount(u);

    const [row] = await db.select().from(users).where(eq(users.id, u));
    expect(row.email).toBe(`deleted-${u}@kickpact.invalid`);
    expect(row.name).toBe("Gelöschter Nutzer");
    expect(row.deletionRequestedAt).toBeNull();
    const remainingSessions = await db.select().from(sessions).where(eq(sessions.userId, u));
    expect(remainingSessions).toHaveLength(0);
  });

  it("anonymizes PII in support tickets tied to the user (DSGVO Art. 17)", async () => {
    const u = await makeUser("ticket@example.de");
    await db.insert(supportTickets).values({
      userId: u,
      name: "Max Mustermann",
      email: "max@example.de",
      subject: "Mein Klarname im Betreff",
      message: "Persönliche Nachricht mit PII"
    });

    await anonymizeUserAccount(u);

    const [row] = await db.select().from(supportTickets).where(eq(supportTickets.userId, u));
    expect(row.name).toBe(DELETED_NAME);
    expect(row.email).not.toBe("max@example.de");
    expect(row.email).not.toContain("@example.de");
    expect(row.subject).not.toContain("Klarname");
    expect(row.message).not.toContain("PII");
  });

  it("anonymizes the sponsor's own message in sponsor inquiries (DSGVO Art. 17)", async () => {
    const u = await makeUser("inq@example.de");
    const club = await makeClub();
    const team = await makeTeam(club);
    await db.insert(sponsorInquiries).values({
      sponsorUserId: u,
      teamId: team,
      message: "Ich heiße Max und will sponsern",
      responseMessage: "Antwort an Max"
    });

    await anonymizeUserAccount(u);

    const [row] = await db
      .select()
      .from(sponsorInquiries)
      .where(eq(sponsorInquiries.sponsorUserId, u));
    expect(row.message).toBeNull();
    expect(row.responseMessage).toBeNull();
  });

  it("leaves other users' support tickets untouched (isolation)", async () => {
    const u = await makeUser("target@example.de");
    const other = await makeUser("other@example.de");
    await db.insert(supportTickets).values({
      userId: other,
      name: "Fremd",
      email: "other-contact@example.de",
      subject: "Fremder Betreff",
      message: "Fremde Nachricht"
    });

    await anonymizeUserAccount(u);

    const [row] = await db.select().from(supportTickets).where(eq(supportTickets.userId, other));
    expect(row.name).toBe("Fremd");
    expect(row.email).toBe("other-contact@example.de");
  });
});
