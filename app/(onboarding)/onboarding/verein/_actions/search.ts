"use server";

import { z } from "zod";
import {
  searchVereine,
  getMannschaften,
  dedupeMannschaften,
} from "@/lib/crawler/fussballde";
import { getServerSession } from "@/lib/auth/session";
import {
  checkTeamCollision,
  findLicensedVereinByFussballdeId,
  type LicensedVereinMatch
} from "@/lib/db/queries/onboarding-collision";
import { isClubMember } from "@/lib/db/queries/membership-requests";
import { coverageFloorFromTeamName, type Coverage } from "@/lib/triggers/coverage";

const searchSchema = z.object({
  query: z.string().min(2).max(80)
});

/**
 * Vereinssuche. Liefert nur noch reine Treffer — KEIN Verein-Level-„belegt"
 * mehr (Spec 2026-05-29 §4: Verein-Existenz allein ist bedeutungslos). Ob etwas
 * belegt ist, entscheidet sich pro Mannschaft (siehe getMannschaftenAction).
 */
export async function searchVereineAction(input: { query: string }) {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Bitte mindestens 2 Zeichen eingeben" };
  }
  try {
    const hits = await searchVereine(parsed.data.query);
    return { ok: true as const, results: hits.slice(0, 15) };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Suche fehlgeschlagen"
    };
  }
}

export interface MannschaftWithStatus {
  name: string;
  slug: string;
  saison: string;
  teamId: string;
  url: string;
  /**
   * Belegt = aktiv betreute Mannschaft eines ANDEREN Users → nicht wählbar,
   * stattdessen „Zugriff anfragen". `none`/`scraped-unmanaged` sind wählbar
   * (letztere wird beim Anlegen in den eigenen Container umgehängt).
   */
  isLocked: boolean;
  /** Slug des Containers, der die Mannschaft hält (für „Zugriff anfragen"). */
  registeredClubSlug: string | null;
  /** DB-Team-ID der belegten Mannschaft (für die gezielte Zugriff-Anfrage). */
  registeredTeamDbId: string | null;
  /** True, wenn die belegte Mannschaft dem aktuellen User gehört. */
  ownedByMe: boolean;
  /**
   * Daten-Coverage-Floor aus der Altersklasse (B1a, Audit 2026-06-11):
   * `none`-Teams (E-/F-/G-Jugend, Bambini) werden NICHT mehr still gefiltert,
   * sondern angezeigt + anlegbar — die UI erklärt, dass es für diese
   * Altersklasse keine automatischen Spieldaten gibt und Ereignisse manuell
   * gemeldet werden.
   */
  dataCoverage: Coverage;
}

/**
 * Lädt die Mannschaften eines Vereins von fußball.de und reichert jede mit
 * ihrem KickPact-Registrierungsstatus an (Kollision pro fussballde_team_id).
 */
export async function getMannschaftenAction(input: {
  vereinId: string;
  slug: string;
  vereinName?: string;
}) {
  try {
    const results = await getMannschaften(input.vereinId, input.slug, input.vereinName);

    // Check A (Spec 2026-05-29 §4, verdrahtet im Audit 2026-06-11 / B2): hat
    // der REALE Verein bereits eine aktive Vereinslizenz auf KickPact, zeigt
    // die UI die Hinweis-Karte „bereits mit Vereinslizenz" + CTA „Beitritt
    // anfragen" (bestehende Membership-Request-Infrastruktur).
    const licensedVerein: LicensedVereinMatch | null =
      await findLicensedVereinByFussballdeId(input.vereinId);

    const session = await getServerSession();
    const currentUserId = session?.user?.id ?? null;

    const enriched: MannschaftWithStatus[] = await Promise.all(
      results.map(async (m) => {
        const collision = await checkTeamCollision(m.teamId, m.saison);
        const dataCoverage = coverageFloorFromTeamName(m.name);
        if (collision.kind === "actively-managed") {
          const ownedByMe = currentUserId
            ? await isClubMember(currentUserId, collision.clubId)
            : false;
          return {
            ...m,
            // Eigene betreute Mannschaft ist nicht „gesperrt" (Resume möglich);
            // fremde schon → „Zugriff anfragen".
            isLocked: !ownedByMe,
            registeredClubSlug: collision.clubSlug,
            registeredTeamDbId: collision.teamId,
            ownedByMe,
            dataCoverage
          };
        }
        // none + scraped-unmanaged → frei wählbar.
        return {
          ...m,
          isLocked: false,
          registeredClubSlug: null,
          registeredTeamDbId: null,
          ownedByMe: false,
          dataCoverage
        };
      })
    );

    // fussball.de listet dieselbe Mannschaft mehrfach (Zero-Width-Space-Doppel,
    // alte vs. aktuelle Vereins-Schreibweise) mit je eigener teamId. Auf je
    // einen Eintrag zusammenfalten — bei Kollision den registrierten/eigenen
    // bzw. denjenigen mit vollständigerem Namen behalten, damit der Status nicht
    // verloren geht und die kanonische Schreibweise gewinnt.
    const rank = (m: MannschaftWithStatus): number =>
      (m.ownedByMe ? 4 : 0) + (m.registeredTeamDbId ? 2 : 0);
    const deduped = dedupeMannschaften(enriched, (incoming, current) => {
      const byStatus = rank(incoming) - rank(current);
      if (byStatus !== 0) return byStatus > 0;
      return incoming.name.length > current.name.length;
    });

    // B1a (Audit 2026-06-11): Coverage-none-Mannschaften (E-/F-/G-Jugend,
    // Bambini — strukturell keine Ergebnisse auf der Daten-Quelle) werden
    // NICHT mehr still herausgefiltert. Sie bleiben anlegbar; die UI zeigt
    // den „keine automatischen Spieldaten"-Hinweis (siehe `dataCoverage`).
    return { ok: true as const, results: deduped, licensedVerein };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Mannschaften laden fehlgeschlagen"
    };
  }
}
