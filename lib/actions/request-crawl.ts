"use server";

import { assertTeamPageAccess } from "@/lib/auth/scope";
import { inngest } from "@/lib/inngest/client";
import { rateLimit } from "@/lib/utils/rate-limit";

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
  // Vibe-Check A: On-Demand-Crawl stößt einen externen fussball.de-Scrape-Job an.
  // Ohne Drossel könnte ein Team-Mitglied per Klick-Flut beliebig viele Jobs
  // erzeugen (Kosten/IP-Ban-Risiko der Scraper-Pipeline). 3 Crawls / 5 Min / Team.
  if (!(await rateLimit(`crawl:${input.teamId}`, { limit: 3, windowMs: 5 * 60_000 }))) {
    return {
      ok: false,
      error: "Zu viele Aktualisierungen in kurzer Zeit. Bitte ein paar Minuten warten."
    };
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
