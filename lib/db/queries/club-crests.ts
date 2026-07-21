import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubCrests, teams } from "@/lib/db/schema";
import type { CrestRef } from "@/lib/crawler/fussballde";

/** Storage-Key des gecachten fussball.de-Wappens einer team-id, oder null. */
export async function getClubCrestLogoUrl(
  fussballdeTeamId: string | null
): Promise<string | null> {
  if (!fussballdeTeamId) return null;
  const [row] = await db
    .select({ logoUrl: clubCrests.logoUrl })
    .from(clubCrests)
    .where(eq(clubCrests.fussballdeTeamId, fussballdeTeamId))
    .limit(1);
  return row?.logoUrl ?? null;
}

/**
 * Reduziert einen Vereins-/Mannschaftsnamen auf den CLUB-Kern, unter dem sein
 * Wappen im Cache liegt.
 *
 * WARUM: Ein Wappen ist ein CLUB-Asset — die Reserve-Mannschaften eines Vereins
 * teilen sich EIN Wappen. `matches` trägt aber den vollen Mannschaftsnamen inkl.
 * Reserve-Suffix („1.FC Mühlhausen 2"), während der Cache den Vereinsnamen aus
 * `data-alt`/der Tabellenzeile führt — oft OHNE Suffix („1.FC Mühlhausen").
 * Der frühere exakte `lower(name) = lower(name)`-Vergleich verfehlte deshalb das
 * gecachte Wappen und zeigte das Kürzel (verifiziert: „1M" statt Mühlhausen-Logo
 * auf einem angesetzten Reserve-Spiel, dessen Stub keine team-id trägt → nur der
 * Name bleibt als Schlüssel).
 *
 * Normalisiert: lowercase, Whitespace kollabiert, und am ENDE entfernt:
 *   - „zg."/„zurückgezogen" (fussball.de-Marker),
 *   - eine schließende Klammer-Annotation („(flex)", „(U19)"),
 *   - die Mannschafts-Nummer (arabische 1–2-stellige Zahl ODER römische Ziffer).
 * Bewusst NICHT gröber: ein zu weiter Kamm ordnete ein FALSCHES Wappen zu — das
 * wäre schlimmer als gar keins. Die 4-stellige Gründungsjahr-Zahl („1899") bleibt
 * dank der {1,2}-Grenze erhalten.
 */
export function normalizeCrestName(name: string | null): string {
  let s = (name ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  s = s.replace(/[\s.]+zg\.?$/, "").trim(); // „… zg." (zurückgezogen)
  s = s.replace(/\s*\([^)]*\)$/, "").trim(); // „(flex)" o.ä. am Ende
  s = s.replace(/\s+(?:[0-9]{1,2}|i{1,3}|iv|v|vi{1,3}|ix|x)$/, "").trim(); // Reserve-Nr.
  return s;
}

/**
 * Wie {@link getClubCrestLogoUrl}, aber per NAME. Nötig, weil `matches`
 * externe Gegner nur mit NAMEN speichert, nicht mit deren fussballde_team_id
 * (heim_team_id/gast_team_id sind nur gesetzt, wenn der Gegner selbst ein
 * KickPact-Team ist; angesetzte Stub-Spiele haben GAR keine team-id). Ohne
 * diesen Fallback fand die Story-Vorschau das gecachte Gegner-Wappen nie.
 *
 * Gematcht wird über {@link normalizeCrestName} — CLUB-Kern gegen CLUB-Kern,
 * damit „1.FC Mühlhausen 2" das unter „1.FC Mühlhausen" gecachte Wappen findet.
 * Kandidaten werden per Präfix vorgefiltert (billig, hält die Menge klein), die
 * eigentliche Gleichheit prüft dann {@link normalizeCrestName} in JS — so bleibt
 * die (getestete) Normalisierung die EINE Wahrheit, ohne SQL-Regex-Drift.
 * Zu kurze Kerne (< 3 Zeichen) werden nicht gematcht: „SV 2" → „sv" träfe sonst
 * beliebige Vereine.
 */
export async function getClubCrestLogoUrlByName(name: string | null): Promise<string | null> {
  const base = normalizeCrestName(name);
  if (base.length < 3) return null;
  // LIKE-Sonderzeichen im Präfix maskieren (Default-Escape ist Backslash).
  const likePattern = base.replace(/([\\%_])/g, "\\$&") + "%";
  const candidates = await db
    .select({ name: clubCrests.name, logoUrl: clubCrests.logoUrl })
    .from(clubCrests)
    .where(and(isNotNull(clubCrests.logoUrl), sql`lower(${clubCrests.name}) like ${likePattern}`))
    .limit(20);
  const hit = candidates.find((r) => normalizeCrestName(r.name) === base);
  return hit?.logoUrl ?? null;
}

/**
 * Legt die Wappen aus einem Spielplan-Scrape im Cache ab (Gegner inklusive).
 *
 * Lädt jedes Wappen HÖCHSTENS EINMAL herunter: eine bekannte team-id mit
 * unveränderter `sourceUrl` wird übersprungen (ein Team taucht in ~80
 * Spielplan-Zeilen/Saison auf, der Cron läuft mehrmals täglich — ohne Guard
 * ein Download-Sturm gegen fussball.de = Ban-Risiko). Der eigentliche
 * Download+Store läuft über den injizierten `fetchAndStore` (echte Impl:
 * fetchCrestBytes + storeDocument) → testbar ohne Netz und R2.
 *
 * `fetchAndStore` liefert `null`, wenn fussball.de nicht erreichbar ist oder
 * die URL kein Bild liefert — dann bleibt der alte Cache-Eintrag stehen bzw.
 * es entsteht keiner, und die Story fällt sauber aufs Kürzel zurück.
 *
 * @returns Anzahl neu gespeicherter/aktualisierter Wappen.
 */
export async function syncClubCrests(
  crests: CrestRef[],
  fetchAndStore: (crest: CrestRef) => Promise<string | null>
): Promise<number> {
  const byId = new Map<string, CrestRef>();
  for (const c of crests) if (!byId.has(c.teamId)) byId.set(c.teamId, c);
  if (byId.size === 0) return 0;

  const existing = await db
    .select({ id: clubCrests.fussballdeTeamId, sourceUrl: clubCrests.sourceUrl })
    .from(clubCrests)
    .where(inArray(clubCrests.fussballdeTeamId, [...byId.keys()]));
  const currentSource = new Map(existing.map((r) => [r.id, r.sourceUrl]));

  let count = 0;
  for (const crest of byId.values()) {
    if (currentSource.get(crest.teamId) === crest.url) continue; // schon aktuell
    const storageUrl = await fetchAndStore(crest);
    if (!storageUrl) continue;
    await db
      .insert(clubCrests)
      .values({
        fussballdeTeamId: crest.teamId,
        logoUrl: storageUrl,
        sourceUrl: crest.url,
        name: crest.name
      })
      .onConflictDoUpdate({
        target: clubCrests.fussballdeTeamId,
        set: {
          logoUrl: storageUrl,
          sourceUrl: crest.url,
          name: crest.name,
          fetchedAt: new Date()
        }
      });
    count++;
  }
  return count;
}

/**
 * Setzt das eigene Team-Wappen aus dem Cache auf `teams.logoUrl` — aber NUR,
 * wenn dort noch nichts steht. Ein vom Verein hochgeladenes Logo gewinnt immer
 * und wird nie durch das fussball.de-Wappen überschrieben (Priorität aus
 * {@link pickCrest}). So erscheint das Wappen automatisch überall, wo
 * `teams.logoUrl` schon gelesen wird (Profil, Discover, Story-eigene-Seite).
 *
 * @returns true, wenn das Logo neu gesetzt wurde.
 */
export async function backfillTeamLogoFromCrest(
  teamId: string,
  fussballdeTeamId: string
): Promise<boolean> {
  const crestKey = await getClubCrestLogoUrl(fussballdeTeamId);
  if (!crestKey) return false;
  const updated = await db
    .update(teams)
    .set({ logoUrl: crestKey })
    .where(and(eq(teams.id, teamId), isNull(teams.logoUrl)))
    .returning({ id: teams.id });
  return updated.length > 0;
}
