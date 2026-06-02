"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { getUserIdentities } from "@/lib/db/queries/user-identities";
import { flattenIdentities } from "@/lib/auth/identity-routing";
import { setPrimaryRole } from "@/lib/auth/primary-role";

/**
 * Setzt die Hauptrolle des Nutzers (= das Dashboard direkt nach dem Login).
 * Validiert serverseitig, dass die gewählte `entryId` tatsächlich zu einer
 * Identität des Nutzers gehört — kein Vertrauen in den Client-Wert.
 */
export async function setPrimaryRoleAction(
  entryId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const identities = await getUserIdentities(user.id);
  const isOwn = flattenIdentities(identities).some((e) => e.id === entryId);
  if (!isOwn) {
    return { ok: false, error: "Diese Rolle gehört nicht zu deinem Konto." };
  }
  await setPrimaryRole(user.id, entryId);
  revalidatePath("/konto");
  revalidatePath("/dashboard");
  return { ok: true };
}
