"use server";

import { z } from "zod";
import {
  searchVereine,
  getMannschaften,
  dedupeMannschaften,
} from "@/lib/crawler/fussballde";
import { getServerSession } from "@/lib/auth/session";
import { checkTeamCollision } from "@/lib/db/queries/onboarding-collision";
import { isClubMember } from "@/lib/db/queries/membership-requests";
import { coverageFloorFromTeamName } from "@/lib/triggers/coverage";

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

    const session = await getServerSession();
    const currentUserId = session?.user?.id ?? null;

    const enriched: MannschaftWithStatus[] = await Promise.all(
      results.map(async (m) => {
        const collision = await checkTeamCollision(m.teamId, m.saison);
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
            ownedByMe
          };
        }
        // none + scraped-unmanaged → frei wählbar.
        return {
          ...m,
          isLocked: false,
          registeredClubSlug: null,
          registeredTeamDbId: null,
          ownedByMe: false
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

    // Mannschaften, für die fußball.de strukturell KEINE Ergebnisse führt
    // (E-/F-/G-Jugend, Bambini — „Fair-Play-Liga ohne Tabelle"), gar nicht erst
    // zur Auswahl anbieten. Rein namensbasiert (kein Fetch). Siehe
    // lib/triggers/coverage.ts + project_spielbericht_coverage.
    const eligible = deduped.filter(
      (m) => coverageFloorFromTeamName(m.name) !== "none"
    );

    return { ok: true as const, results: eligible };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Mannschaften laden fehlgeschlagen"
    };
  }
}
