import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema/auth";
import { flattenIdentities } from "@/lib/auth/identity-routing";
import type { UserIdentities } from "@/lib/db/queries/user-identities";

/**
 * Auflösung der „Hauptrolle" (users.primary_role) zum Post-Login-Dashboard.
 *
 * `primary_role` speichert die stabile `IdentityEntry.id` (z.B. `club-team-<id>`,
 * `club-<clubId>`, `team-<teamId>`, `sponsor-<id>`) — dieselbe ID, die der
 * Header-Rollen-Switcher nutzt. Dadurch ist die Auflösung ein simples Lookup in
 * `flattenIdentities`, ohne kind-spezifische URL-Logik zu duplizieren.
 *
 * Verhalten:
 *  - 0 Identitäten → /signup
 *  - gültige Hauptrolle gesetzt → direkt deren Dashboard (KEIN /select-role,
 *    auch bei mehreren Rollen — der User wollte direkt in seine Hauptrolle)
 *  - Hauptrolle null/ungültig (Rolle gelöscht, Plan geändert) → erste
 *    verfügbare Identität als Default; der Dispatcher persistiert sie lazy.
 */
export interface PrimaryDestination {
  href: string;
  /** Die `IdentityEntry.id` hinter `href`, oder null für /signup. */
  resolvedId: string | null;
  /** True, wenn `href` aus dem Fallback kam (keine gültige Hauptrolle gesetzt). */
  defaulted: boolean;
}

export function primaryDestinationFor(
  ids: UserIdentities,
  storedPrimaryRole: string | null
): PrimaryDestination {
  const entries = flattenIdentities(ids);
  if (entries.length === 0) {
    return { href: "/signup", resolvedId: null, defaulted: true };
  }
  if (storedPrimaryRole) {
    const hit = entries.find((e) => e.id === storedPrimaryRole);
    if (hit) return { href: hit.href, resolvedId: hit.id, defaulted: false };
  }
  const first = entries[0];
  return { href: first.href, resolvedId: first.id, defaulted: true };
}

export async function getStoredPrimaryRole(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ primaryRole: users.primaryRole })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.primaryRole ?? null;
}

/**
 * Setzt `entryId` als Hauptrolle, aber nur wenn noch keine gesetzt ist
 * (race-sicher via isNull-Guard). Best-effort — wirft nie in den Aufrufer,
 * damit ein fehlgeschlagener Schreibvorgang den Login nicht kippt.
 */
export async function persistPrimaryRoleIfUnset(
  userId: string,
  entryId: string
): Promise<void> {
  try {
    await db
      .update(users)
      .set({ primaryRole: entryId })
      .where(and(eq(users.id, userId), isNull(users.primaryRole)));
  } catch {
    /* Hauptrolle ist eine Komfort-Funktion — Persistenz-Fehler ignorieren. */
  }
}

/** Explizite Auswahl in „Mein Konto" — überschreibt eine vorhandene Hauptrolle. */
export async function setPrimaryRole(userId: string, entryId: string): Promise<void> {
  await db.update(users).set({ primaryRole: entryId }).where(eq(users.id, userId));
}
