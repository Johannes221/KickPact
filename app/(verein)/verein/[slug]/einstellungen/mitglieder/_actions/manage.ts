"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { assertClubAccess } from "@/lib/auth/scope";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import {
  changeClubMembershipRole,
  changeTeamMembershipRole,
  countClubAdmins,
  revokeClubMembership,
  revokeTeamMembership
} from "@/lib/db/queries/membership-requests";

const LAST_ADMIN_ERROR =
  "Du bist der letzte Admin — demoten nicht möglich. Befördere zuerst eine andere Person.";

const clubRoleSchema = z.enum(["admin", "trainer", "viewer"]);
const teamRoleSchema = z.enum(["trainer", "viewer"]);

const changeRoleSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("club"),
    clubSlug: z.string().min(1),
    targetUserId: z.string().min(1),
    newRole: clubRoleSchema
  }),
  z.object({
    scope: z.literal("team"),
    clubSlug: z.string().min(1),
    targetUserId: z.string().min(1),
    teamId: z.string().min(1),
    newRole: teamRoleSchema
  })
]);

const revokeSchema = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("club"),
    clubSlug: z.string().min(1),
    targetUserId: z.string().min(1)
  }),
  z.object({
    scope: z.literal("team"),
    clubSlug: z.string().min(1),
    targetUserId: z.string().min(1),
    teamId: z.string().min(1)
  })
]);

export type ChangeRoleInput = z.infer<typeof changeRoleSchema>;
export type RevokeInput = z.infer<typeof revokeSchema>;

/**
 * Verifies the given team belongs to the given club. Returns false if either
 * the team does not exist or belongs to a different club — prevents an admin
 * of club A from touching memberships of club B by passing a foreign teamId.
 */
async function assertTeamBelongsToClub(teamId: string, clubId: string): Promise<boolean> {
  const [team] = await db
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.clubId, clubId)))
    .limit(1);
  return Boolean(team);
}

export async function changeRoleAction(input: ChangeRoleInput) {
  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const admin = await requireUser();
  const { club } = await assertClubAccess(parsed.data.clubSlug, "admin");

  const data = parsed.data;

  if (data.scope === "club") {
    // Self-demotion guard: if the acting admin demotes themselves below admin,
    // verify at least one other admin remains.
    if (data.targetUserId === admin.id && data.newRole !== "admin") {
      const adminCount = await countClubAdmins(club.id);
      if (adminCount <= 1) {
        return { ok: false as const, error: LAST_ADMIN_ERROR };
      }
    }
    const updated = await changeClubMembershipRole(
      club.id,
      data.targetUserId,
      data.newRole
    );
    if (!updated) {
      return { ok: false as const, error: "Mitgliedschaft nicht gefunden" };
    }
  } else {
    const belongs = await assertTeamBelongsToClub(data.teamId, club.id);
    if (!belongs) {
      return { ok: false as const, error: "Mannschaft nicht gefunden" };
    }
    const updated = await changeTeamMembershipRole(
      data.teamId,
      data.targetUserId,
      data.newRole
    );
    if (!updated) {
      return { ok: false as const, error: "Mitgliedschaft nicht gefunden" };
    }
  }

  revalidatePath(`/verein/${club.slug}/einstellungen/mitglieder`);
  return { ok: true as const };
}

export async function revokeAction(input: RevokeInput) {
  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const admin = await requireUser();
  const { club } = await assertClubAccess(parsed.data.clubSlug, "admin");

  const data = parsed.data;

  if (data.scope === "club") {
    // Self-revoke is equivalent to self-demotion (admin → nothing) → guard.
    if (data.targetUserId === admin.id) {
      const adminCount = await countClubAdmins(club.id);
      if (adminCount <= 1) {
        return { ok: false as const, error: LAST_ADMIN_ERROR };
      }
    }
    const ok = await revokeClubMembership(club.id, data.targetUserId);
    if (!ok) return { ok: false as const, error: "Mitgliedschaft nicht gefunden" };
  } else {
    const belongs = await assertTeamBelongsToClub(data.teamId, club.id);
    if (!belongs) {
      return { ok: false as const, error: "Mannschaft nicht gefunden" };
    }
    const ok = await revokeTeamMembership(data.teamId, data.targetUserId);
    if (!ok) return { ok: false as const, error: "Mitgliedschaft nicht gefunden" };
  }

  revalidatePath(`/verein/${club.slug}/einstellungen/mitglieder`);
  return { ok: true as const };
}
