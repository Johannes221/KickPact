"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/auth/session";
import { acceptTeamMemberInvitation } from "@/lib/db/queries/invitations";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";

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
    const [club] = await db
      .select({ slug: clubs.slug })
      .from(clubs)
      .where(eq(clubs.id, result.clubId))
      .limit(1);
    if (club) redirectTo = `/verein/${club.slug}`;
  } else if (result.scope === "team" && result.teamId) {
    const [team] = await db
      .select({ id: teams.id, clubSlug: clubs.slug })
      .from(teams)
      .innerJoin(clubs, eq(teams.clubId, clubs.id))
      .where(eq(teams.id, result.teamId))
      .limit(1);
    if (team) redirectTo = `/verein/${team.clubSlug}/mannschaft/${team.id}`;
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
