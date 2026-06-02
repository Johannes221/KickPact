import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clubs,
  clubVerifications,
  teams,
  teamVerifications,
  teamLicenses,
  users,
  invoices,
  invoiceItems,
  charges,
  pledges,
  sponsors
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

    // Mannschaftsabo-Modell: Bei einem Verein OHNE Vereinslizenz ist der
    // Container-Club deckungsgleich mit der Mannschaft. Die Team-Verifizierung
    // ist dann DIE Verifizierung → wir verifizieren den Container-Club mit,
    // damit das Rechnungs-Gate (clubs.verifiedAt) greift. Bei echter
    // Vereinslizenz bleibt die separate Vereins-Verifizierung das Gate.
    const [teamRow] = await tx
      .select({ clubId: teams.clubId })
      .from(teams)
      .where(eq(teams.id, existing.teamId))
      .limit(1);
    if (teamRow) {
      const vereinLicense = await tx
        .select({ id: teamLicenses.id })
        .from(teamLicenses)
        .innerJoin(teams, eq(teamLicenses.teamId, teams.id))
        .where(and(eq(teams.clubId, teamRow.clubId), eq(teamLicenses.plan, "verein")))
        .limit(1);
      if (vereinLicense.length === 0) {
        await tx
          .update(clubs)
          .set({ verifiedAt: now })
          .where(and(eq(clubs.id, teamRow.clubId), isNull(clubs.verifiedAt)));
      }
    }
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

// ─────────────────────────────────────────────────────────────────────────────
// Withhold-Release
// ─────────────────────────────────────────────────────────────────────────────

export interface ReleaseResult {
  count: number;
  invoiceIds: string[];
}

/**
 * Release withheld invoices for a club: flip status='sent'.
 * Called after a club verification is approved.
 * Returns the count + IDs of released invoices (IDs used for sponsor mail).
 */
export async function releaseWithheldInvoicesForClub(
  clubId: string
): Promise<ReleaseResult> {
  const result = await db
    .update(invoices)
    .set({ status: "sent", sentAt: new Date() })
    .where(and(eq(invoices.clubId, clubId), eq(invoices.status, "withheld")))
    .returning({ id: invoices.id });
  return { count: result.length, invoiceIds: result.map((r) => r.id) };
}

/**
 * Release withheld invoices after a team verification is approved.
 *
 * An invoice is released only when BOTH conditions hold:
 *   1. The club linked to the invoice is verified (clubs.verifiedAt IS NOT NULL)
 *   2. ALL teams involved in the invoice (via invoice_items→charges→pledges→teams)
 *      are verified.
 *
 * This avoids a schema change (no invoices.teamId needed).
 * Returns the number of invoices released.
 */
export async function releaseWithheldInvoicesForTeam(
  teamId: string
): Promise<ReleaseResult> {
  // 1. Resolve club + verify it is itself already approved
  const [teamRow] = await db
    .select({ clubId: teams.clubId })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!teamRow) return { count: 0, invoiceIds: [] };

  const [clubRow] = await db
    .select({ verifiedAt: clubs.verifiedAt })
    .from(clubs)
    .where(eq(clubs.id, teamRow.clubId))
    .limit(1);
  if (!clubRow?.verifiedAt) return { count: 0, invoiceIds: [] };

  // 2. Collect all withheld invoices for the club
  const withheld = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(
      and(eq(invoices.clubId, teamRow.clubId), eq(invoices.status, "withheld"))
    );
  if (withheld.length === 0) return { count: 0, invoiceIds: [] };

  const withheldIds = withheld.map((r) => r.id);

  // 3. Find invoices still blocked by at least one unverified team
  const stillBlocked = await db
    .selectDistinct({ invoiceId: invoiceItems.invoiceId })
    .from(invoiceItems)
    .innerJoin(charges, eq(invoiceItems.chargeId, charges.id))
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .where(
      and(
        inArray(invoiceItems.invoiceId, withheldIds),
        isNull(teams.verifiedAt)
      )
    );

  const blockedIds = new Set(stillBlocked.map((r) => r.invoiceId));
  const toRelease = withheldIds.filter((id) => !blockedIds.has(id));
  if (toRelease.length === 0) return { count: 0, invoiceIds: [] };

  const released = await db
    .update(invoices)
    .set({ status: "sent", sentAt: new Date() })
    .where(inArray(invoices.id, toRelease))
    .returning({ id: invoices.id });

  const invoiceIds = released.map((r) => r.id);
  return { count: invoiceIds.length, invoiceIds };
}

export interface ReleasedInvoiceSponsorInfo {
  sponsorEmail: string;
  sponsorName: string;
  invoiceCount: number;
}

/**
 * Given a list of just-released invoice IDs, return one entry per sponsor
 * with their email, display name, and how many invoices were released for them.
 * Used to send the Phase-E3 notification mails.
 *
 * Pass the IDs returned by releaseWithheldInvoicesForClub / ...ForTeam
 * directly — no time-based heuristic needed.
 */
export async function getSponsorMailInfoForInvoices(
  invoiceIds: string[]
): Promise<ReleasedInvoiceSponsorInfo[]> {
  if (invoiceIds.length === 0) return [];

  const rows = await db
    .select({
      sponsorEmail: users.email,
      sponsorName: sponsors.displayName,
      invoiceId: invoices.id
    })
    .from(invoices)
    .innerJoin(sponsors, eq(invoices.sponsorId, sponsors.id))
    .innerJoin(users, eq(sponsors.userId, users.id))
    .where(inArray(invoices.id, invoiceIds));

  // Group by sponsor email so each sponsor gets exactly one mail
  const byEmail = new Map<string, ReleasedInvoiceSponsorInfo>();
  for (const r of rows) {
    const existing = byEmail.get(r.sponsorEmail);
    if (existing) {
      existing.invoiceCount++;
    } else {
      byEmail.set(r.sponsorEmail, {
        sponsorEmail: r.sponsorEmail,
        sponsorName: r.sponsorName,
        invoiceCount: 1
      });
    }
  }
  return [...byEmail.values()];
}

/**
 * Widerruft alle (nicht bereits widerrufenen) Verifikationen eines Clubs und
 * setzt clubs.verifiedAt zurück — in EINER Transaktion (Operator-Aktion).
 */
export async function revokeClubVerification(clubId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(clubVerifications)
      .set({ status: "revoked" })
      .where(
        and(
          eq(clubVerifications.clubId, clubId),
          ne(clubVerifications.status, "revoked")
        )
      );
    await tx.update(clubs).set({ verifiedAt: null }).where(eq(clubs.id, clubId));
  });
}

/**
 * Review-Infos einer Club-Verifikation (club_verifications → clubs + users):
 * alles für Mail + Dashboard-Link. Null wenn nicht gefunden.
 */
export async function getVerificationReviewInfo(verificationId: string): Promise<{
  clubId: string;
  clubSlug: string;
  clubName: string;
  submitterEmail: string;
} | null> {
  const [row] = await db
    .select({
      clubId: clubs.id,
      clubSlug: clubs.slug,
      clubName: clubs.name,
      submitterEmail: users.email
    })
    .from(clubVerifications)
    .innerJoin(clubs, eq(clubVerifications.clubId, clubs.id))
    .innerJoin(users, eq(clubVerifications.submittedByUserId, users.id))
    .where(eq(clubVerifications.id, verificationId))
    .limit(1);
  return row ?? null;
}

/**
 * Review-Infos einer Team-Verifikation (team_verifications → teams → clubs +
 * users). Null wenn nicht gefunden.
 */
export async function getTeamVerificationReviewInfo(verificationId: string): Promise<{
  teamId: string;
  teamName: string;
  clubSlug: string;
  submitterEmail: string;
} | null> {
  const [row] = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      clubSlug: clubs.slug,
      submitterEmail: users.email
    })
    .from(teamVerifications)
    .innerJoin(teams, eq(teamVerifications.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .innerJoin(users, eq(teamVerifications.submittedByUserId, users.id))
    .where(eq(teamVerifications.id, verificationId))
    .limit(1);
  return row ?? null;
}
