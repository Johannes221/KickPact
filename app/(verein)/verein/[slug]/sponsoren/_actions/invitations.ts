"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertClubWriteAccess } from "@/lib/auth/scope";
import {
  createInvitation,
  getTeamContainerVerifiedAt,
  revokeInvitation
} from "@/lib/db/queries/invitations";

const createSchema = z.object({
  clubSlug: z.string().min(1),
  teamId: z.string().min(1),
  recipientName: z.string().trim().optional()
});

export async function createInvitationAction(input: {
  clubSlug: string;
  teamId: string;
  recipientName?: string;
}) {
  const parsed = createSchema.parse(input);
  const { user } = await assertClubWriteAccess(parsed.clubSlug, "admin");

  // Sponsoren-Gate (Design 2026-05-29 §3.5/§6): Einladungen sind erst erlaubt,
  // wenn der Container-Verein DER MANNSCHAFT verifiziert ist — nicht der
  // Slug-Verein, da der Container nach dem Identity-Refactor abweichen kann.
  const verifiedAt = await getTeamContainerVerifiedAt(parsed.teamId);
  if (!verifiedAt) {
    throw new Error(
      "Bitte zuerst den Verein verifizieren, dann kannst du Sponsoren einladen."
    );
  }

  const inv = await createInvitation({
    teamId: parsed.teamId,
    createdByUserId: user.id,
    recipientName: parsed.recipientName || undefined
  });
  revalidatePath(`/verein/${parsed.clubSlug}/sponsoren`);
  return { token: inv.token };
}

export async function revokeInvitationAction(input: { clubSlug: string; invitationId: string }) {
  const { club } = await assertClubWriteAccess(input.clubSlug, "admin");
  await revokeInvitation(input.invitationId, club.id);
  revalidatePath(`/verein/${input.clubSlug}/sponsoren`);
}
