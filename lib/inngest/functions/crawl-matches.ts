import { inngest } from "@/lib/inngest/client";
import { getSpiele, getSpielDetails } from "@/lib/crawler/fussballde";
import {
  getActiveTeams,
  findMatchByFussballdeId,
  insertMatchWithEvents
} from "@/lib/db/queries/crawler";
import { getSubscriptionGate } from "@/lib/db/queries/subscription-status";

export const crawlMatches = inngest.createFunction(
  { id: "crawl-matches", concurrency: { limit: 2 } },
  [{ cron: "0 */6 * * *" }, { event: "crawler/manual" }],
  async ({ step, logger }) => {
    const teams = await step.run("load-active-teams", () => getActiveTeams());
    logger.info(`crawl-matches: ${teams.length} aktive Teams`);

    let totalNewMatches = 0;
    let skippedReadOnly = 0;
    for (const team of teams) {
      // Read-Only-Clubs überspringen — spart fussball.de-Calls für inaktive Vereine.
      const gate = await step.run(`gate-${team.id}`, () =>
        getSubscriptionGate(team.clubId)
      );
      if (gate.isReadOnly) {
        logger.info("skipped because club is read-only", {
          clubId: team.clubId,
          teamId: team.id
        });
        skippedReadOnly++;
        continue;
      }

      const spiele = await step.run(`get-spiele-${team.id}`, () =>
        getSpiele(team.fussballdeTeamId, team.fussballdeSlug, team.saison)
      );

      for (const spiel of spiele) {
        const exists = await step.run(`check-${spiel.spielId}`, () =>
          findMatchByFussballdeId(spiel.spielId)
        );
        if (exists) continue;

        const details = await step.run(`details-${spiel.spielId}`, () =>
          getSpielDetails(spiel.spielId, spiel.slug)
        );

        const { matchId } = await step.run(`persist-${spiel.spielId}`, () =>
          insertMatchWithEvents({ teamId: team.id, listItem: spiel, details })
        );

        await step.sendEvent("emit-match-finished", {
          name: "match/finished",
          data: { matchId, teamId: team.id }
        });

        totalNewMatches++;
      }
    }

    return { newMatches: totalNewMatches, skippedReadOnly };
  }
);
