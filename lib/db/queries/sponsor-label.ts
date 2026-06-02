import { sql } from "drizzle-orm";
import { sponsors, users } from "@/lib/db/schema";

/**
 * SQL-Ausdruck für einen IMMER nicht-leeren, identifizierbaren Sponsor-
 * Anzeigenamen. Fallback-Kette:
 *   displayName (falls gesetzt+nicht leer)
 *   → User-Name
 *   → E-Mail-Präfix (vor dem @)
 *   → "Sponsor"
 *
 * Hintergrund: `sponsors.displayName` kann (v.a. bei Alt-/Test-Daten) leer sein
 * — dann zeigte die UI keinen Sponsor zu einem Pact. Da jeder Pact per FK
 * zwingend einem Sponsor gehört, ist der Sponsor damit überall garantiert
 * sichtbar (korrektes Datenmodell-Verhalten an der Anzeige-Grenze).
 *
 * Voraussetzung: die Query joined `sponsors` UND `users`
 * (`leftJoin(users, eq(sponsors.userId, users.id))`).
 */
export const sponsorLabelSql = sql<string>`COALESCE(NULLIF(${sponsors.displayName}, ''), ${users.name}, split_part(${users.email}, '@', 1), 'Sponsor')`;

/**
 * JS-seitiges Äquivalent zu {@link sponsorLabelSql}: leitet aus dem User einen
 * IMMER nicht-leeren Sponsor-Anzeigenamen ab. Wird beim Anlegen eines Sponsor-
 * Profils genutzt, damit `display_name` nie als leerer String in die DB geht
 * (sonst ist der Sponsor zu einem Pact nicht identifizierbar).
 */
export function deriveSponsorDisplayName(user: {
  name?: string | null;
  email?: string | null;
}): string {
  const name = user.name?.trim();
  if (name) return name;
  const emailLocal = user.email?.trim().split("@")[0]?.trim();
  if (emailLocal) return emailLocal;
  return "Sponsor";
}
