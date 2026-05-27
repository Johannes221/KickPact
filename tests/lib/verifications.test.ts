import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, clubs, clubVerifications, teams } from "@/lib/db/schema";
import {
  createVerificationSubmission,
  listPendingVerifications,
  getActiveVerificationForClub,
  approveVerification,
  rejectVerification,
  createTeamVerificationSubmission,
  listPendingTeamVerifications,
  getActiveVerificationForTeam,
  approveTeamVerification,
  rejectTeamVerification
} from "@/lib/db/queries/verifications";
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

async function seedClub(hint: string): Promise<string> {
  const id = createId();
  await db.insert(clubs).values({
    id,
    slug: `${hint}-${id.slice(0, 6)}`,
    name: `Club ${hint}`
  });
  return id;
}

async function seedTeam(clubId: string, hint = "t"): Promise<string> {
  const id = createId();
  await db.insert(teams).values({
    id,
    clubId,
    name: `Team ${hint}`,
    saison: "2526"
  });
  return id;
}

function baseSubmission(clubId: string, userId: string) {
  return {
    clubId,
    submittedByUserId: userId,
    docType: "vereinsregister_auszug" as const,
    docFilename: "auszug.pdf",
    docStorageKey: `r2://test/verifications/${clubId}/test-auszug.pdf`,
    docMimeType: "application/pdf",
    docSizeBytes: 12345,
    submitterRole: "1. Vorsitzender",
    submitterFullName: "Max Mustermann",
    submitterNotes: null as string | null
  };
}

function baseTeamSubmission(teamId: string, userId: string) {
  return {
    teamId,
    submittedByUserId: userId,
    docType: "trainer_license" as const,
    docFilename: "lizenz.pdf",
    docStorageKey: `r2://test/verifications/teams/${teamId}/test-lizenz.pdf`,
    docMimeType: "application/pdf",
    docSizeBytes: 9876,
    submitterRole: "Cheftrainer",
    submitterFullName: "Hans Trainer",
    submitterNotes: null as string | null
  };
}

describe("verifications queries", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("createVerificationSubmission inserts pending row", async () => {
    const userId = await seedUser("submit");
    const clubId = await seedClub("a");
    const row = await createVerificationSubmission(baseSubmission(clubId, userId));

    expect(row.status).toBe("pending");
    expect(row.clubId).toBe(clubId);
    expect(row.submittedByUserId).toBe(userId);
    expect(row.docType).toBe("vereinsregister_auszug");
    expect(row.id).toMatch(/^[a-z0-9]{20,}$/);
    expect(row.reviewedAt).toBeNull();
  });

  it("listPendingVerifications returns rows with requester + club info, oldest first", async () => {
    const userA = await seedUser("a");
    const userB = await seedUser("b");
    const clubA = await seedClub("alfa");
    const clubB = await seedClub("beta");

    const reqA = await createVerificationSubmission(baseSubmission(clubA, userA));
    // small wait so submittedAt differs
    await new Promise((r) => setTimeout(r, 50));
    await createVerificationSubmission(baseSubmission(clubB, userB));

    const rows = await listPendingVerifications();
    expect(rows.length).toBe(2);
    // Oldest first
    expect(rows[0].id).toBe(reqA.id);
    expect(rows[0].submitterEmail).toMatch(/u-a-/);
    expect(rows[0].clubName).toBe("Club alfa");
  });

  it("listPendingVerifications excludes resolved (approved/rejected)", async () => {
    const userId = await seedUser("excl");
    const clubA = await seedClub("c");
    const clubB = await seedClub("d");
    const adminId = await seedUser("admin");

    const reqA = await createVerificationSubmission(baseSubmission(clubA, userId));
    await createVerificationSubmission(baseSubmission(clubB, userId));

    await approveVerification({ verificationId: reqA.id, reviewedByUserId: adminId });

    const rows = await listPendingVerifications();
    expect(rows.length).toBe(1);
    expect(rows[0].clubId).toBe(clubB);
  });

  it("approveVerification flips status + sets clubs.verifiedAt", async () => {
    const userId = await seedUser("appr");
    const adminId = await seedUser("adm");
    const clubId = await seedClub("appr");

    const req = await createVerificationSubmission(baseSubmission(clubId, userId));
    await approveVerification({ verificationId: req.id, reviewedByUserId: adminId });

    const updated = await getActiveVerificationForClub(clubId);
    expect(updated?.status).toBe("approved");
    expect(updated?.reviewedByUserId).toBe(adminId);
    expect(updated?.reviewedAt).not.toBeNull();

    const [club] = await db
      .select({ verifiedAt: clubs.verifiedAt })
      .from(clubs)
      .where(eq(clubs.id, clubId))
      .limit(1);
    expect(club.verifiedAt).not.toBeNull();
  });

  it("rejectVerification flips status + stores reason, leaves clubs.verifiedAt null", async () => {
    const userId = await seedUser("rej");
    const adminId = await seedUser("adm2");
    const clubId = await seedClub("rej");

    const req = await createVerificationSubmission(baseSubmission(clubId, userId));
    await rejectVerification({
      verificationId: req.id,
      reviewedByUserId: adminId,
      reason: "Dokument abgelaufen — bitte aktuelles Datum"
    });

    const updated = await getActiveVerificationForClub(clubId);
    expect(updated?.status).toBe("rejected");
    expect(updated?.rejectionReason).toBe("Dokument abgelaufen — bitte aktuelles Datum");

    const [club] = await db
      .select({ verifiedAt: clubs.verifiedAt })
      .from(clubs)
      .where(eq(clubs.id, clubId))
      .limit(1);
    expect(club.verifiedAt).toBeNull();
  });

  it("getActiveVerificationForClub returns latest non-revoked submission", async () => {
    const userId = await seedUser("active");
    const adminId = await seedUser("adm3");
    const clubId = await seedClub("active");

    const first = await createVerificationSubmission(baseSubmission(clubId, userId));
    await rejectVerification({
      verificationId: first.id,
      reviewedByUserId: adminId,
      reason: "Erstes Dokument war unleserlich"
    });

    await new Promise((r) => setTimeout(r, 50));
    const second = await createVerificationSubmission({
      ...baseSubmission(clubId, userId),
      docFilename: "auszug-neu.pdf"
    });

    const active = await getActiveVerificationForClub(clubId);
    expect(active?.id).toBe(second.id);
    expect(active?.status).toBe("pending");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Team-Verifications (Spec 2026-05-26 §1.7)
// ─────────────────────────────────────────────────────────────────────────────

describe("team verifications queries", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("createTeamVerificationSubmission inserts pending row", async () => {
    const userId = await seedUser("tv-submit");
    const clubId = await seedClub("tv-a");
    const teamId = await seedTeam(clubId, "tv-a");

    const row = await createTeamVerificationSubmission(
      baseTeamSubmission(teamId, userId)
    );

    expect(row.status).toBe("pending");
    expect(row.teamId).toBe(teamId);
    expect(row.submittedByUserId).toBe(userId);
    expect(row.docType).toBe("trainer_license");
    expect(row.id).toMatch(/^[a-z0-9]{20,}$/);
    expect(row.reviewedAt).toBeNull();
  });

  it("listPendingTeamVerifications returns rows with team+club info, oldest first", async () => {
    const userA = await seedUser("tv-la");
    const userB = await seedUser("tv-lb");
    const clubA = await seedClub("tv-alfa");
    const clubB = await seedClub("tv-beta");
    const teamA = await seedTeam(clubA, "herren");
    const teamB = await seedTeam(clubB, "damen");

    const reqA = await createTeamVerificationSubmission(
      baseTeamSubmission(teamA, userA)
    );
    await new Promise((r) => setTimeout(r, 50));
    await createTeamVerificationSubmission(baseTeamSubmission(teamB, userB));

    const rows = await listPendingTeamVerifications();
    expect(rows.length).toBe(2);
    // FIFO: oldest first
    expect(rows[0].id).toBe(reqA.id);
    expect(rows[0].submitterEmail).toMatch(/tv-la/);
    expect(rows[0].teamName).toBe("Team herren");
    expect(rows[0].clubName).toBe("Club tv-alfa");
  });

  it("listPendingTeamVerifications excludes approved and rejected rows", async () => {
    const userId = await seedUser("tv-excl");
    const adminId = await seedUser("tv-admin");
    const clubA = await seedClub("tv-c");
    const clubB = await seedClub("tv-d");
    const teamA = await seedTeam(clubA, "approved");
    const teamB = await seedTeam(clubB, "pending");

    const reqA = await createTeamVerificationSubmission(
      baseTeamSubmission(teamA, userId)
    );
    await createTeamVerificationSubmission(baseTeamSubmission(teamB, userId));

    await approveTeamVerification({
      verificationId: reqA.id,
      reviewedByUserId: adminId
    });

    const rows = await listPendingTeamVerifications();
    expect(rows.length).toBe(1);
    expect(rows[0].teamId).toBe(teamB);
  });

  it("approveTeamVerification flips status + sets teams.verifiedAt", async () => {
    const userId = await seedUser("tv-appr");
    const adminId = await seedUser("tv-adm");
    const clubId = await seedClub("tv-appr");
    const teamId = await seedTeam(clubId, "appr");

    const req = await createTeamVerificationSubmission(
      baseTeamSubmission(teamId, userId)
    );
    await approveTeamVerification({
      verificationId: req.id,
      reviewedByUserId: adminId
    });

    const updated = await getActiveVerificationForTeam(teamId);
    expect(updated?.status).toBe("approved");
    expect(updated?.reviewedByUserId).toBe(adminId);
    expect(updated?.reviewedAt).not.toBeNull();

    const [team] = await db
      .select({ verifiedAt: teams.verifiedAt })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    expect(team.verifiedAt).not.toBeNull();
  });

  it("rejectTeamVerification flips status + stores reason, leaves teams.verifiedAt null", async () => {
    const userId = await seedUser("tv-rej");
    const adminId = await seedUser("tv-adm2");
    const clubId = await seedClub("tv-rej");
    const teamId = await seedTeam(clubId, "rej");

    const req = await createTeamVerificationSubmission(
      baseTeamSubmission(teamId, userId)
    );
    await rejectTeamVerification({
      verificationId: req.id,
      reviewedByUserId: adminId,
      reason: "Foto nicht lesbar — bitte erneut einreichen"
    });

    const updated = await getActiveVerificationForTeam(teamId);
    expect(updated?.status).toBe("rejected");
    expect(updated?.rejectionReason).toBe(
      "Foto nicht lesbar — bitte erneut einreichen"
    );

    const [team] = await db
      .select({ verifiedAt: teams.verifiedAt })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    expect(team.verifiedAt).toBeNull();
  });

  it("getActiveVerificationForTeam returns latest non-revoked submission", async () => {
    const userId = await seedUser("tv-active");
    const adminId = await seedUser("tv-adm3");
    const clubId = await seedClub("tv-active");
    const teamId = await seedTeam(clubId, "resubmit");

    const first = await createTeamVerificationSubmission(
      baseTeamSubmission(teamId, userId)
    );
    await rejectTeamVerification({
      verificationId: first.id,
      reviewedByUserId: adminId,
      reason: "Dokument abgelaufen"
    });

    await new Promise((r) => setTimeout(r, 50));
    const second = await createTeamVerificationSubmission({
      ...baseTeamSubmission(teamId, userId),
      docFilename: "lizenz-neu.pdf"
    });

    const active = await getActiveVerificationForTeam(teamId);
    expect(active?.id).toBe(second.id);
    expect(active?.status).toBe("pending");
  });

  it("approveTeamVerification throws for non-pending verification", async () => {
    const userId = await seedUser("tv-idem");
    const adminId = await seedUser("tv-adm4");
    const clubId = await seedClub("tv-idem");
    const teamId = await seedTeam(clubId, "idem");

    const req = await createTeamVerificationSubmission(
      baseTeamSubmission(teamId, userId)
    );
    await approveTeamVerification({
      verificationId: req.id,
      reviewedByUserId: adminId
    });

    // Second approve must throw (idempotency guard)
    await expect(
      approveTeamVerification({
        verificationId: req.id,
        reviewedByUserId: adminId
      })
    ).rejects.toThrow(/not pending/);
  });
});
