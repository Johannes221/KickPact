import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { sponsorInvitations } from "@/lib/db/schema/invitations";

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function createInvitation(args: { teamId: string; createdByUserId: string }) {
  const token = generateToken();
  const [row] = await db
    .insert(sponsorInvitations)
    .values({ teamId: args.teamId, createdByUserId: args.createdByUserId, token })
    .returning();
  return row;
}

export async function findInvitationByToken(token: string) {
  const [row] = await db
    .select()
    .from(sponsorInvitations)
    .where(eq(sponsorInvitations.token, token))
    .limit(1);
  return row ?? null;
}

export async function markInvitationUsed(token: string, usedByUserId: string) {
  await db
    .update(sponsorInvitations)
    .set({ status: "used", usedAt: new Date(), usedByUserId })
    .where(eq(sponsorInvitations.token, token));
}
