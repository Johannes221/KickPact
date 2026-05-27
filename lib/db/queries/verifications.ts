import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clubs,
  clubVerifications,
  teams,
  teamVerifications,
  users
} from "@/lib/db/schema";

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

// ─────────────────────────────────────────────────────────────────────────────
// Team-Verifications (Spec 2026-05-26 §1.7) — analog clubVerifications.
// Bei autarken Mannschaften (ohne Vereinslizenz) muss der/die Mannschafts-
// Verwalter/in einen Nachweis erbringen, dass die Mannschaft betreut wird.
// ─────────────────────────────────────────────────────────────────────────────

export type TeamVerificationDocType =
  | "trainer_license"
  | "club_letter"
  | "team_photo"
  | "fussballde_entry"
  | "sonstiges";

export interface TeamVerification {
  id: string;
  teamId: string;
  submittedByUserId: string;
  docType: TeamVerificationDocType;
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

export interface CreateTeamSubmissionArgs {
  teamId: string;
  submittedByUserId: string;
  docType: TeamVerificationDocType;
  docFilename: string;
  docStorageKey: string;
  docMimeType: string;
  docSizeBytes: number;
  submitterRole: string;
  submitterFullName: string;
  submitterNotes: string | null;
}

export async function createTeamVerificationSubmission(
  args: CreateTeamSubmissionArgs
): Promise<TeamVerification> {
  const [row] = await db.insert(teamVerifications).values(args).returning();
  return row as TeamVerification;
}

export interface PendingTeamVerificationRow extends TeamVerification {
  submitterEmail: string;
  teamName: string;
  teamSaison: string;
  clubName: string;
  clubSlug: string;
}

/**
 * Operator-inbox query: alle pending Team-Verifications, älteste zuerst.
 */
export async function listPendingTeamVerifications(): Promise<
  PendingTeamVerificationRow[]
> {
  const rows = await db
    .select({
      id: teamVerifications.id,
      teamId: teamVerifications.teamId,
      submittedByUserId: teamVerifications.submittedByUserId,
      docType: teamVerifications.docType,
      docFilename: teamVerifications.docFilename,
      docStorageKey: teamVerifications.docStorageKey,
      docMimeType: teamVerifications.docMimeType,
      docSizeBytes: teamVerifications.docSizeBytes,
      submitterRole: teamVerifications.submitterRole,
      submitterFullName: teamVerifications.submitterFullName,
      submitterNotes: teamVerifications.submitterNotes,
      status: teamVerifications.status,
      reviewedAt: teamVerifications.reviewedAt,
      reviewedByUserId: teamVerifications.reviewedByUserId,
      rejectionReason: teamVerifications.rejectionReason,
      submittedAt: teamVerifications.submittedAt,
      submitterEmail: users.email,
      teamName: teams.name,
      teamSaison: teams.saison,
      clubName: clubs.name,
      clubSlug: clubs.slug
    })
    .from(teamVerifications)
    .innerJoin(users, eq(teamVerifications.submittedByUserId, users.id))
    .innerJoin(teams, eq(teamVerifications.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(teamVerifications.status, "pending"))
    .orderBy(teamVerifications.submittedAt);

  return rows as PendingTeamVerificationRow[];
}

export async function getActiveVerificationForTeam(
  teamId: string
): Promise<TeamVerification | null> {
  const [row] = await db
    .select()
    .from(teamVerifications)
    .where(
      and(
        eq(teamVerifications.teamId, teamId),
        ne(teamVerifications.status, "revoked")
      )
    )
    .orderBy(desc(teamVerifications.submittedAt))
    .limit(1);
  return (row as TeamVerification | undefined) ?? null;
}

/**
 * Approve setzt teams.verified_at = now() im selben Transaktions-Schritt.
 * Wirft wenn Verifikation nicht existiert oder nicht pending (Idempotenz).
 */
export async function approveTeamVerification(args: ApproveArgs): Promise<void> {
  const [existing] = await db
    .select()
    .from(teamVerifications)
    .where(eq(teamVerifications.id, args.verificationId))
    .limit(1);
  if (!existing) throw new Error(`team verification not found: ${args.verificationId}`);
  if (existing.status !== "pending") {
    throw new Error(`team verification not pending (status=${existing.status})`);
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(teamVerifications)
      .set({
        status: "approved",
        reviewedAt: now,
        reviewedByUserId: args.reviewedByUserId
      })
      .where(eq(teamVerifications.id, args.verificationId));

    await tx
      .update(teams)
      .set({ verifiedAt: now })
      .where(eq(teams.id, existing.teamId));
  });
}

export async function rejectTeamVerification(args: RejectArgs): Promise<void> {
  const [existing] = await db
    .select()
    .from(teamVerifications)
    .where(eq(teamVerifications.id, args.verificationId))
    .limit(1);
  if (!existing) throw new Error(`team verification not found: ${args.verificationId}`);
  if (existing.status !== "pending") {
    throw new Error(`team verification not pending (status=${existing.status})`);
  }

  await db
    .update(teamVerifications)
    .set({
      status: "rejected",
      reviewedAt: new Date(),
      reviewedByUserId: args.reviewedByUserId,
      rejectionReason: args.reason
    })
    .where(eq(teamVerifications.id, args.verificationId));
}
