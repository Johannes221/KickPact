import { eq, and, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, clubMembershipRequests, users, clubVerifications } from "@/lib/db/schema";
import { ConflictsTable } from "./_components/conflicts-table";

export const metadata = { title: "Konflikte · Admin · KickPact" };

export default async function ConflictsPage() {
  const rows = await db
    .select({
      id: clubMembershipRequests.id,
      clubId: clubs.id,
      clubName: clubs.name,
      clubSlug: clubs.slug,
      claimantEmail: users.email,
      requestedRole: clubMembershipRequests.requestedRole,
      message: clubMembershipRequests.message,
      conflictDocStorageKey: clubMembershipRequests.conflictDocStorageKey,
      createdAt: clubMembershipRequests.createdAt
    })
    .from(clubMembershipRequests)
    .innerJoin(clubs, eq(clubMembershipRequests.clubId, clubs.id))
    .innerJoin(users, eq(clubMembershipRequests.userId, users.id))
    .where(
      and(
        eq(clubMembershipRequests.isConflictClaim, true),
        eq(clubMembershipRequests.status, "pending")
      )
    )
    .orderBy(desc(clubMembershipRequests.createdAt));

  // For each conflict, also fetch the EXISTING admin's verification doc
  // (so operator can compare both sides)
  const enriched = await Promise.all(
    rows.map(async (r) => {
      const [existing] = await db
        .select({
          submitterEmail: users.email,
          submitterFullName: clubVerifications.submitterFullName,
          docStorageKey: clubVerifications.docStorageKey,
          docFilename: clubVerifications.docFilename
        })
        .from(clubVerifications)
        .innerJoin(users, eq(clubVerifications.submittedByUserId, users.id))
        .where(
          and(
            eq(clubVerifications.clubId, r.clubId),
            eq(clubVerifications.status, "approved")
          )
        )
        .orderBy(desc(clubVerifications.reviewedAt))
        .limit(1);
      return {
        ...r,
        existingAdmin: existing ?? null
      };
    })
  );

  if (enriched.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-8 text-center text-sm text-brand-night-navy/60">
        Keine offenen Konflikte.
      </div>
    );
  }

  return <ConflictsTable rows={enriched} />;
}
