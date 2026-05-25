import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, clubs, clubVerifications } from "@/lib/db/schema";
import {
  createVerificationSubmission,
  listPendingVerifications,
  getActiveVerificationForClub,
  approveVerification,
  rejectVerification
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
