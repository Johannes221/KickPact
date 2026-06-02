"use server";

import { assertTeamPageAccess } from "@/lib/auth/scope";
import { inngest } from "@/lib/inngest/client";

/**
 * Manuelles „Spiele aktualisieren" aus der App: stößt einen On-Demand-Crawl
 * für genau diese Mannschaft an (Event `crawler/team.crawl`, siehe
 * lib/inngest/functions/crawl-matches.ts). Markiert serverseitig den Crawl-Start
 * → `isCrawling` wird true → die Spiele-Seite zeigt den „lädt"-Status und pollt.
 *
 * Zugriff: Team-Mitglied (viewer) — dieselbe Ebene wie die Spiele-Seite selbst.
 */
export async function requestTeamCrawlAction(input: {
  slug: string;
  teamId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await assertTeamPageAccess(input.slug, input.teamId, "viewer");
  } catch {
    return { ok: false, error: "Kein Zugriff auf diese Mannschaft." };
  }
  try {
    await inngest.send({
      name: "crawler/team.crawl",
      data: { teamId: input.teamId }
    });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Aktualisierung konnte nicht gestartet werden."
    };
  }
}
