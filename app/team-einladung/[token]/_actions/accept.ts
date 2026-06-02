"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import {
  acceptTeamMemberInvitation,
  getClubNameSlugByTeam
} from "@/lib/db/queries/invitations";
import { getClubById } from "@/lib/db/queries/club-admin";

const acceptSchema = z.object({ token: z.string().min(8) });

export type AcceptInviteResult =
  | { ok: true; redirectTo: string }
  | { ok: false; error: string };

export async function acceptInviteAction(input: {
  token: string;
}): Promise<AcceptInviteResult> {
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Ungültige Eingabe" };
  }
  const user = await requireUser();

  let result;
  try {
    result = await acceptTeamMemberInvitation({
      token: parsed.data.token,
      userId: user.id
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Einladung konnte nicht eingelöst werden.";
    return { ok: false, error: msg };
  }

  let redirectTo = "/dashboard";
  if (result.scope === "club" && result.clubId) {
    const club = await getClubById(result.clubId);
    if (club) redirectTo = `/verein/${club.slug}`;
  } else if (result.scope === "team" && result.teamId) {
    const club = await getClubNameSlugByTeam(result.teamId);
    if (club) redirectTo = `/verein/${club.slug}/mannschaft/${result.teamId}`;
  }

  revalidatePath("/dashboard");
  return { ok: true, redirectTo };
}

/**
 * Form-action-Variante für Progressive Enhancement: nutzt redirect() statt
 * eines Result-Objekts, damit die Page auch ohne JS funktioniert. Wirft bei
 * Fehlern eine Exception, die Next.js als 500-Page zeigt — Client-Form
 * sollte stattdessen `acceptInviteAction` mit Result-Handling verwenden.
 */
export async function acceptInviteFormAction(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const res = await acceptInviteAction({ token });
  if (!res.ok) {
    throw new Error(res.error);
  }
  redirect(res.redirectTo);
}
