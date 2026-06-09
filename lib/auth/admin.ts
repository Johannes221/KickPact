import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema/auth";
import { getServerSession } from "./session";

/**
 * Source-of-Truth für Plattform-Operator-Zugang ist die DB-Spalte
 * users.is_platform_admin (gesetzt per Seed/Migration, nie self-service).
 * Ersetzt die frühere ENV-Allowlist KICKPACT_ADMIN_EMAILS.
 *
 * Operator-Accounts loggen sich via E-Mail+Passwort ein; der Magic-Link-Flow
 * verweigert den Versand für Operator-Mails (siehe lib/auth/server.ts), damit
 * der Operator-Zugang nicht über den passwortlosen Pfad umgangen werden kann.
 */
/** E-Mails aller Plattform-Operatoren (für interne Benachrichtigungen). */
export async function listPlatformAdminEmails(): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.isPlatformAdmin, true));
  return rows.map((r) => r.email);
}

export interface PlatformAdmin {
  id: string;
  email: string;
  name: string | null;
}

/** Alle Plattform-Operatoren (für das Assignee-Dropdown im Support-Workflow). */
export async function listPlatformAdmins(): Promise<PlatformAdmin[]> {
  return db
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.isPlatformAdmin, true))
    .orderBy(users.email);
}

/**
 * Guard für Rollen-Erstellungs-Actions: Plattform-Operatoren dürfen KEINE
 * Vereins-/Mannschafts-/Sponsor-Rolle anlegen (keine Doppelrolle). Wirft in
 * Server-Actions; der Client zeigt die Meldung als Toast.
 */
export async function assertNotPlatformAdminAction(email: string): Promise<void> {
  if (await isPlatformAdminEmail(email)) {
    throw new Error(
      "Operator-Accounts können keine Vereins-, Mannschafts- oder Sponsor-Rolle anlegen."
    );
  }
}

export async function isPlatformAdminEmail(email: string): Promise<boolean> {
  const row = await db
    .select({ isPlatformAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return row[0]?.isPlatformAdmin === true;
}

/**
 * Operator-Check über die User-ID statt der E-Mail. Vorzuziehen überall dort,
 * wo bereits eine Session vorliegt: die ID ist die stabile Identität (kein
 * Casing-/Whitespace-Risiko wie bei der E-Mail) und matcht genau die Zeile,
 * unter der der User eingeloggt ist. Verhindert, dass ein Operator versehentlich
 * den Nutzer-Rollen-Chooser sieht, weil ein E-Mail-Vergleich danebengeht.
 */
export async function isPlatformAdminUser(userId: string): Promise<boolean> {
  const row = await db
    .select({ isPlatformAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row[0]?.isPlatformAdmin === true;
}

/**
 * Page-level guard für /admin/*. Lädt den User, prüft das is_platform_admin-
 * Flag und leitet bei Fehlen auf den Operator-Login um. Gibt den User zurück,
 * damit Admin-Seiten "Reviewed by …" zeigen können.
 */
export async function assertPlatformAdmin() {
  const session = await getServerSession();
  if (!session?.user) {
    redirect("/admin/login");
  }
  const user = session.user;
  const row = await db
    .select({ isPlatformAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  if (row[0]?.isPlatformAdmin !== true) {
    redirect("/admin/login");
  }
  return { user };
}
