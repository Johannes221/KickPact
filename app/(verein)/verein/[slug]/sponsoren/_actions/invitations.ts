"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertClubWriteAccess } from "@/lib/auth/scope";
import { createInvitation, revokeInvitation } from "@/lib/db/queries/invitations";

const createSchema = z.object({
  clubSlug: z.string().min(1),
  teamId: z.string().min(1)
});

export async function createInvitationAction(input: { clubSlug: string; teamId: string }) {
  const parsed = createSchema.parse(input);
  const { user } = await assertClubWriteAccess(parsed.clubSlug, "admin");
  const inv = await createInvitation({ teamId: parsed.teamId, createdByUserId: user.id });
  revalidatePath(`/verein/${parsed.clubSlug}/sponsoren`);
  return { token: inv.token };
}

export async function revokeInvitationAction(input: { clubSlug: string; invitationId: string }) {
  const { club } = await assertClubWriteAccess(input.clubSlug, "admin");
  await revokeInvitation(input.invitationId, club.id);
  revalidatePath(`/verein/${input.clubSlug}/sponsoren`);
}
