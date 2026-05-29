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

export async function isPlatformAdminEmail(email: string): Promise<boolean> {
  const row = await db
    .select({ isPlatformAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
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
