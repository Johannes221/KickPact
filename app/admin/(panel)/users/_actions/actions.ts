"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { auth } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import {
  updateUserProfile,
  setUserDeletionRequested,
  anonymizeUserAccount,
  setClubMembershipRole,
  removeClubMembership
} from "@/lib/db/queries/user-admin";
import { recordOperatorAction } from "@/lib/db/queries/operator-audit";

async function loadUser(userId: string) {
  const [row] = await db
    .select({ id: users.id, email: users.email, isPlatformAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

const profileSchema = z.object({
  userId: z.string().min(1),
  name: z.string().min(1).max(120),
  email: z.string().email()
});

export async function updateUserProfileAction(input: {
  userId: string;
  name: string;
  email: string;
}) {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  const before = await loadUser(parsed.data.userId);
  if (!before) return { ok: false as const, error: "User nicht gefunden" };

  const res = await updateUserProfile(parsed.data);
  if (!res.ok) {
    return { ok: false as const, error: "E-Mail wird bereits von einem anderen Account genutzt." };
  }

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "user.update_profile",
    targetType: "user",
    targetId: parsed.data.userId,
    summary: `Profil bearbeitet: ${before.email} → ${parsed.data.email.toLowerCase()}`,
    diff: { before: { email: before.email }, after: { name: parsed.data.name, email: parsed.data.email.toLowerCase() } }
  });

  revalidatePath(`/admin/users/${parsed.data.userId}`);
  return { ok: true as const };
}

const userIdSchema = z.object({ userId: z.string().min(1) });

export async function resendMagicLinkAction(input: { userId: string }) {
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  const target = await loadUser(parsed.data.userId);
  if (!target) return { ok: false as const, error: "User nicht gefunden" };
  if (target.isPlatformAdmin) {
    return { ok: false as const, error: "Operator-Accounts nutzen Passwort-Login, keinen Magic-Link." };
  }

  try {
    await auth.api.signInMagicLink({
      headers: await headers(),
      body: { email: target.email, callbackURL: "/dashboard" }
    });
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Versand fehlgeschlagen" };
  }

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "user.resend_magic_link",
    targetType: "user",
    targetId: target.id,
    summary: `Magic-Link erneut gesendet an ${target.email}`
  });

  return { ok: true as const };
}

export async function setUserDeletionAction(input: { userId: string; requested: boolean }) {
  const parsed = userIdSchema.extend({ requested: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  const target = await loadUser(parsed.data.userId);
  if (!target) return { ok: false as const, error: "User nicht gefunden" };

  await setUserDeletionRequested({ userId: parsed.data.userId, requested: parsed.data.requested });

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: parsed.data.requested ? "user.deletion_request" : "user.deletion_cancel",
    targetType: "user",
    targetId: target.id,
    summary: parsed.data.requested
      ? `Löschung beantragt für ${target.email} (Anonymisierung in 14 Tagen)`
      : `Löschantrag zurückgenommen für ${target.email}`
  });

  revalidatePath(`/admin/users/${parsed.data.userId}`);
  return { ok: true as const };
}

export async function anonymizeUserNowAction(input: { userId: string }) {
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  const target = await loadUser(parsed.data.userId);
  if (!target) return { ok: false as const, error: "User nicht gefunden" };
  if (target.id === admin.id) {
    return { ok: false as const, error: "Du kannst deinen eigenen Operator-Account nicht anonymisieren." };
  }

  // Audit VOR der Anonymisierung schreiben — danach ist die E-Mail ein Tombstone.
  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "user.anonymize_now",
    targetType: "user",
    targetId: target.id,
    summary: `Account sofort anonymisiert (DSGVO): ${target.email}`
  });

  await anonymizeUserAccount(parsed.data.userId);

  revalidatePath(`/admin/users/${parsed.data.userId}`);
  return { ok: true as const };
}

const roleSchema = z.object({
  userId: z.string().min(1),
  clubId: z.string().min(1),
  role: z.enum(["admin", "trainer", "viewer"])
});

export async function setClubRoleAction(input: {
  userId: string;
  clubId: string;
  role: "admin" | "trainer" | "viewer";
}) {
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  await setClubMembershipRole(parsed.data);

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "user.club_role_change",
    targetType: "user",
    targetId: parsed.data.userId,
    summary: `Club-Rolle geändert → ${parsed.data.role} (Club ${parsed.data.clubId})`,
    diff: { clubId: parsed.data.clubId, role: parsed.data.role }
  });

  revalidatePath(`/admin/users/${parsed.data.userId}`);
  return { ok: true as const };
}

const removeSchema = z.object({ userId: z.string().min(1), clubId: z.string().min(1) });

export async function removeClubMembershipAction(input: { userId: string; clubId: string }) {
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  await removeClubMembership(parsed.data);

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "user.club_membership_remove",
    targetType: "user",
    targetId: parsed.data.userId,
    summary: `Club-Membership entfernt (Club ${parsed.data.clubId})`,
    diff: { clubId: parsed.data.clubId }
  });

  revalidatePath(`/admin/users/${parsed.data.userId}`);
  return { ok: true as const };
}
