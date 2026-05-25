import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, clubVerifications, users } from "@/lib/db/schema";

export type VerificationStatus = "pending" | "approved" | "rejected" | "revoked";
export type VerificationDocType =
  | "vereinsregister_auszug"
  | "vorstands_beschluss"
  | "vereinssatzung"
  | "mitgliederversammlung_protokoll"
  | "sonstiges";

export interface ClubVerification {
  id: string;
  clubId: string;
  submittedByUserId: string;
  docType: VerificationDocType;
  docFilename: string;
  docStorageKey: string;
  docMimeType: string;
  docSizeBytes: number;
  submitterRole: string;
  submitterFullName: string;
  submitterNotes: string | null;
  status: VerificationStatus;
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  rejectionReason: string | null;
  submittedAt: Date;
}

export interface CreateSubmissionArgs {
  clubId: string;
  submittedByUserId: string;
  docType: VerificationDocType;
  docFilename: string;
  docStorageKey: string;
  docMimeType: string;
  docSizeBytes: number;
  submitterRole: string;
  submitterFullName: string;
  submitterNotes: string | null;
}

export async function createVerificationSubmission(
  args: CreateSubmissionArgs
): Promise<ClubVerification> {
  const [row] = await db
    .insert(clubVerifications)
    .values(args)
    .returning();
  return row as ClubVerification;
}

export interface PendingVerificationRow extends ClubVerification {
  submitterEmail: string;
  clubName: string;
  clubSlug: string;
}

/**
 * Operator-inbox query: all pending verifications, oldest first (so the
 * queue is FIFO by submission time). Joins club + submitter for direct
 * display.
 */
export async function listPendingVerifications(): Promise<PendingVerificationRow[]> {
  const rows = await db
    .select({
      id: clubVerifications.id,
      clubId: clubVerifications.clubId,
      submittedByUserId: clubVerifications.submittedByUserId,
      docType: clubVerifications.docType,
      docFilename: clubVerifications.docFilename,
      docStorageKey: clubVerifications.docStorageKey,
      docMimeType: clubVerifications.docMimeType,
      docSizeBytes: clubVerifications.docSizeBytes,
      submitterRole: clubVerifications.submitterRole,
      submitterFullName: clubVerifications.submitterFullName,
      submitterNotes: clubVerifications.submitterNotes,
      status: clubVerifications.status,
      reviewedAt: clubVerifications.reviewedAt,
      reviewedByUserId: clubVerifications.reviewedByUserId,
      rejectionReason: clubVerifications.rejectionReason,
      submittedAt: clubVerifications.submittedAt,
      submitterEmail: users.email,
      clubName: clubs.name,
      clubSlug: clubs.slug
    })
    .from(clubVerifications)
    .innerJoin(users, eq(clubVerifications.submittedByUserId, users.id))
    .innerJoin(clubs, eq(clubVerifications.clubId, clubs.id))
    .where(eq(clubVerifications.status, "pending"))
    .orderBy(clubVerifications.submittedAt);

  return rows as PendingVerificationRow[];
}

/**
 * Returns the most recent non-revoked verification for a club, or null
 * if none has ever been submitted. Used for the Verein-Dashboard banner
 * and Re-Upload-flow.
 */
export async function getActiveVerificationForClub(
  clubId: string
): Promise<ClubVerification | null> {
  const [row] = await db
    .select()
    .from(clubVerifications)
    .where(
      and(
        eq(clubVerifications.clubId, clubId),
        ne(clubVerifications.status, "revoked")
      )
    )
    .orderBy(desc(clubVerifications.submittedAt))
    .limit(1);
  return (row as ClubVerification | undefined) ?? null;
}

export interface ApproveArgs {
  verificationId: string;
  reviewedByUserId: string;
}

/**
 * Marks the verification approved and sets clubs.verifiedAt = now()
 * in a single transaction. Throws if verification doesn't exist or is
 * not pending (idempotency safeguard).
 */
export async function approveVerification(args: ApproveArgs): Promise<void> {
  const [existing] = await db
    .select()
    .from(clubVerifications)
    .where(eq(clubVerifications.id, args.verificationId))
    .limit(1);
  if (!existing) throw new Error(`verification not found: ${args.verificationId}`);
  if (existing.status !== "pending") {
    throw new Error(`verification not pending (status=${existing.status})`);
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(clubVerifications)
      .set({
        status: "approved",
        reviewedAt: now,
        reviewedByUserId: args.reviewedByUserId
      })
      .where(eq(clubVerifications.id, args.verificationId));

    await tx
      .update(clubs)
      .set({ verifiedAt: now })
      .where(eq(clubs.id, existing.clubId));
  });
}

export interface RejectArgs {
  verificationId: string;
  reviewedByUserId: string;
  reason: string;
}

/**
 * Marks the verification rejected and records the reason. Does NOT touch
 * clubs.verifiedAt (an earlier successful verification stays valid).
 */
export async function rejectVerification(args: RejectArgs): Promise<void> {
  const [existing] = await db
    .select()
    .from(clubVerifications)
    .where(eq(clubVerifications.id, args.verificationId))
    .limit(1);
  if (!existing) throw new Error(`verification not found: ${args.verificationId}`);
  if (existing.status !== "pending") {
    throw new Error(`verification not pending (status=${existing.status})`);
  }

  await db
    .update(clubVerifications)
    .set({
      status: "rejected",
      reviewedAt: new Date(),
      reviewedByUserId: args.reviewedByUserId,
      rejectionReason: args.reason
    })
    .where(eq(clubVerifications.id, args.verificationId));
}
