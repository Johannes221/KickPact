import { inngest } from "@/lib/inngest/client";
import {
  getSpiele,
  getSpielDetails,
  computeMatchHash
} from "@/lib/crawler/fussballde";
import { validateSpielListItem, validateSpielDetails } from "@/lib/crawler/validator";
import {
  getActiveTeams,
  getActiveTeamById,
  findMatchByFussballdeId,
  insertMatchWithEvents,
  updateMatchWithEvents,
  type ActiveTeam
} from "@/lib/db/queries/crawler";
import { invalidateChargesForMatch } from "@/lib/db/queries/charges";
import { getSubscriptionGate } from "@/lib/db/queries/subscription-status";

export const crawlMatches = inngest.createFunction(
  { id: "crawl-matches", concurrency: { limit: 2 } },
  [
    { cron: "0 */6 * * *" },
    { event: "crawler/manual" },
    { event: "crawler/team.crawl" }
  ],
  async ({ event, step, logger }) => {
    // crawler/team.crawl event → nur dieses Team crawlen (z.B. on-demand vom Dashboard).
    // Cron + crawler/manual → alle aktiven Teams.
    const requestedTeamId =
      event?.name === "crawler/team.crawl" && typeof event.data?.teamId === "string"
        ? (event.data.teamId as string)
        : null;

    let targetTeams: ActiveTeam[];
    if (requestedTeamId) {
      const t = await step.run(`load-team-${requestedTeamId}`, () =>
        getActiveTeamById(requestedTeamId)
      );
      if (!t) {
        logger.info("team not found or not active", { teamId: requestedTeamId });
        return { newMatches: 0, skippedReadOnly: 0, mode: "single-team-noop" };
      }
      targetTeams = [t];
    } else {
      targetTeams = await step.run("load-active-teams", () => getActiveTeams());
    }

    logger.info(
      `crawl-matches: ${targetTeams.length} Team(s)${requestedTeamId ? " (single-team)" : ""}`
    );

    let totalNewMatches = 0;
    let totalUpdatedMatches = 0;
    let skippedReadOnly = 0;
    let skippedInvalid = 0;
    for (const team of targetTeams) {
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

      // Checkpoint 1: sanity-check each list entry before we spend a full detail request on it
      const validSpiele = spiele.filter((s) => {
        const v = validateSpielListItem(s);
        if (!v.valid) {
          logger.warn("skipped list item: validation failed", {
            spielId: s.spielId,
            datum: s.datum,
            reason: v.reason,
            teamId: team.id
          });
          skippedInvalid++;
        }
        return v.valid;
      });

      for (const spiel of validSpiele) {
        const existing = await step.run(`check-${spiel.spielId}`, () =>
          findMatchByFussballdeId(spiel.spielId)
        );

        const details = await step.run(`details-${spiel.spielId}`, () =>
          getSpielDetails(spiel.spielId, spiel.slug)
        );

        // Checkpoint 2: sanity-check the scraped match details before writing to DB
        const detailsCheck = validateSpielDetails(details);
        if (!detailsCheck.valid) {
          logger.warn("skipped match details: validation failed", {
            spielId: spiel.spielId,
            datum: spiel.datum,
            reason: detailsCheck.reason,
            teamId: team.id
          });
          skippedInvalid++;
          continue;
        }

        const newHash = computeMatchHash({
          ergebnisHeim: details.ergebnis.heim,
          ergebnisGast: details.ergebnis.gast,
          halbzeitHeim: details.halbzeit?.heim ?? null,
          halbzeitGast: details.halbzeit?.gast ?? null,
          events: details.events.map((e) => ({
            minute: e.minute,
            type: e.typ.toLowerCase(),
            side: e.side === "unbekannt" ? "heim" : e.side,
            spielerId: e.spielerId ?? null
          }))
        });

        if (existing) {
          // Already in DB. Hash unchanged → nothing to do.
          if (existing.contentHash === newHash) continue;

          // Match data changed on fussball.de — invalidate stale charges, then
          // re-import events and re-emit so evaluate-match can recompute.
          await step.run(`invalidate-charges-${spiel.spielId}`, () =>
            invalidateChargesForMatch(existing.id, "match_updated")
          );
          await step.run(`update-${spiel.spielId}`, () =>
            updateMatchWithEvents({
              matchId: existing.id,
              teamId: team.id,
              listItem: spiel,
              details,
              contentHash: newHash
            })
          );

          await step.sendEvent("emit-match-updated", {
            name: "match/finished",
            data: { matchId: existing.id, teamId: team.id, updated: true }
          });

          totalUpdatedMatches++;
          continue;
        }

        const { matchId } = await step.run(`persist-${spiel.spielId}`, () =>
          insertMatchWithEvents({
            teamId: team.id,
            listItem: spiel,
            details,
            contentHash: newHash
          })
        );

        await step.sendEvent("emit-match-finished", {
          name: "match/finished",
          data: { matchId, teamId: team.id, updated: false }
        });

        totalNewMatches++;
      }
    }

    return {
      newMatches: totalNewMatches,
      updatedMatches: totalUpdatedMatches,
      skippedReadOnly,
      skippedInvalid
    };
  }
);
