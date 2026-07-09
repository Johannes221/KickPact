import { inngest } from "@/lib/inngest/client";
import { getCachedStandings } from "@/lib/recap/standings-cache";

/**
 * Prewarm der Liga-Tabelle fürs Wrapped im HINTERGRUND. Der Render-Pfad
 * (`getCachedStandingsForRequest`) darf nie synchron scrapen (~6–30 s, frischer
 * Chromium-Launch) — er feuert bei Cache-Miss dieses Event und rendert sofort
 * mit stale/null. Dieser Job holt die Tabelle nach und schreibt sie in
 * `team_standings`; der nächste Aufruf ist instant. `getCachedStandings` wirft
 * nie (best-effort), `concurrency` deckelt parallele Browser-Launches.
 */
export const prewarmStandings = inngest.createFunction(
  { id: "prewarm-standings", concurrency: { limit: 2 } },
  { event: "recap/prewarm-standings" },
  async ({ event, step }) => {
    const { teamId, saison } = event.data as { teamId?: string; saison?: string };
    if (!teamId || !saison) return { skipped: "missing-args" };
    const res = await step.run("scrape-standings", () =>
      getCachedStandings(teamId, saison)
    );
    return { teamId, saison, rows: res?.rows?.length ?? 0 };
  }
);
