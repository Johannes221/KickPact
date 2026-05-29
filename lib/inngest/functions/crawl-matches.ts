import { inngest } from "@/lib/inngest/client";
import {
  getSpiele,
  getSpielDetails,
  computeMatchHash,
  getKader
} from "@/lib/crawler/fussballde";
import { validateSpielListItem, validateSpielDetails } from "@/lib/crawler/validator";
import {
  getActiveTeams,
  getActiveTeamById,
  findMatchByFussballdeId,
  insertMatchWithEvents,
  updateMatchWithEvents,
  markCrawlStarted,
  markCrawlCompleted,
  markCrawlError,
  persistKader,
  type ActiveTeam
} from "@/lib/db/queries/crawler";
import { invalidateChargesForMatch } from "@/lib/db/queries/charges";
import { upsertScheduledMatch } from "@/lib/db/queries/matches";
import { getSubscriptionGate } from "@/lib/db/queries/subscription-status";
import { isCrawlerSommerpause } from "@/lib/utils/sommerpause";

export const crawlMatches = inngest.createFunction(
  { id: "crawl-matches", concurrency: { limit: 2 } },
  [
    // Crawler-Throttling. Amateurfußball-Spielzeit ist Sa/So — zu häufige Runs
    // sind Verschwendung + erhöhen fussball.de-Bann-Risiko. Zweimal täglich
    // (mittags + abends, UTC → 12:00/20:00 CEST in der Sommerzeit): mittags
    // zieht Vortags-/Vormittagsspiele, abends die Samstag-/Sonntag-Ergebnisse.
    { cron: "0 10,18 * * *" },
    { event: "crawler/manual" },
    { event: "crawler/team.crawl" }
  ],
  async ({ event, step, logger }) => {
    // Sommerpause-Guard: Cron-Runs werden während der Crawler-Sommerpause
    // (Juni bis Mitte Juli) übersprungen. Ab Mitte Juli läuft der Crawler wieder,
    // um die neuen Saison-Spielpläne (scheduled-Stubs) vor Saisonauftakt zu
    // erfassen — engeres Fenster als die Billing-Sommerpause (isSommerpause).
    // Manuelle Triggers (crawler/manual, crawler/team.crawl) laufen immer durch.
    const isCronRun = event?.name !== "crawler/manual" && event?.name !== "crawler/team.crawl";
    if (isCronRun && isCrawlerSommerpause()) {
      logger.info("crawl-matches: Sommerpause aktiv — Cron übersprungen.");
      return { skipped: true, reason: "sommerpause", newMatches: 0, updatedMatches: 0 };
    }

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
    let totalScheduledMatches = 0;
    let skippedReadOnly = 0;
    let skippedInvalid = 0;
    for (const team of targetTeams) {
     try {
      // Crawl-Start markieren → Dashboard zeigt das „Spiele werden geladen"-
      // Banner für die Dauer dieses Laufs (siehe lib/crawler/crawl-status.ts).
      await step.run(`crawl-start-${team.id}`, () => markCrawlStarted(team.id));

      // Read-Only-Clubs überspringen — spart fussball.de-Calls für inaktive Vereine.
      //
      // Audit 2026-05-24 Phase 2 / Task 2.4: bewusst symmetrisch — wenn der
      // Club read-only ist, läuft WEDER der initiale Crawl NOCH der
      // Match-Update-Path. Damit kann ein Match-Update auf fussball.de
      // (z.B. Korrektur eines Ergebnisses) keine alten Charges via
      // invalidateChargesForMatch wegputzen, ohne dass die nachgelagerte
      // evaluate-match-Pipeline neue Charges erzeugen würde (evaluate-match
      // hat ein eigenes gate). Beim ersten Cron nach Reaktivierung läuft
      // der Crawler komplett durch, Hash-Vergleich detected den Drift, und
      // alles wird konsistent neu aufgebaut.
      const gate = await step.run(`gate-${team.id}`, () =>
        getSubscriptionGate(team.clubId)
      );
      if (gate.isReadOnly) {
        logger.info("skipped because club is read-only", {
          clubId: team.clubId,
          teamId: team.id
        });
        // Crawl als abgeschlossen markieren, sonst hinge das Banner am Stale-Guard.
        await step.run(`crawl-done-ro-${team.id}`, () => markCrawlCompleted(team.id));
        skippedReadOnly++;
        continue;
      }

      // Kader scrapen + persistieren, damit "Tor von Spieler X"-Pacts
      // (goal_by_player) direkt nach dem Onboarding einrichtbar sind — sonst
      // entstehen Spieler erst aus den Events des ersten gecrawlten Spiels.
      // Non-fatal: ein Kader-Fehler darf den Match-Crawl nicht abbrechen.
      await step.run(`squad-${team.id}`, async () => {
        try {
          const kader = await getKader(
            team.fussballdeTeamId,
            team.fussballdeSlug,
            team.saison
          );
          return await persistKader(team.id, kader);
        } catch (err) {
          logger.warn("squad scrape failed (non-fatal)", {
            teamId: team.id,
            err: String(err)
          });
          return 0;
        }
      });

      const spiele = await step.run(`get-spiele-${team.id}`, () =>
        getSpiele(team.fussballdeTeamId, team.fussballdeSlug, team.saison)
      );

      // ─── Geplante (kommende) Spiele ────────────────────────────────────────
      // next.games liefert Spiele in der Zukunft. Diese werden als scheduled-
      // Stub persistiert: KEIN Detail-Scrape, KEINE Events, KEINE Charges,
      // KEIN match/finished-Emit. validateSpielListItem verwirft Zukunftsdaten
      // (by design für gespielte Spiele) — deshalb laufen scheduled-Items NICHT
      // durch diesen Filter, sondern durch eine leichtgewichtige Eigenprüfung.
      const scheduledSpiele = spiele.filter((s) => s.status === "scheduled");
      for (const spiel of scheduledSpiele) {
        // Minimal-Sanity: spielId + Teamnamen müssen plausibel sein (sonst Stub-
        // Müll). Wir reusen NICHT validateSpielListItem (rejected Zukunftsdatum).
        const idOk = /^[A-Z0-9]{6,}$/i.test(spiel.spielId.trim());
        const namesOk =
          spiel.heim.trim().length >= 2 && spiel.gast.trim().length >= 2;
        if (!idOk || !namesOk) {
          logger.warn("skipped scheduled list item: implausible", {
            spielId: spiel.spielId,
            datum: spiel.datum,
            teamId: team.id
          });
          skippedInvalid++;
          continue;
        }
        const { inserted } = await step.run(`schedule-${spiel.spielId}`, () =>
          upsertScheduledMatch({
            teamId: team.id,
            fussballdeSpielId: spiel.spielId,
            datum: spiel.datum,
            heimName: spiel.heim,
            gastName: spiel.gast
          })
        );
        if (inserted) totalScheduledMatches++;
      }

      // ─── Gespielte Spiele ──────────────────────────────────────────────────
      // Checkpoint 1: sanity-check each list entry before we spend a full detail request on it
      const validSpiele = spiele
        .filter((s) => s.status === "finished")
        .filter((s) => {
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

      // Team fertig gecrawlt → Banner kann ausgeblendet werden.
      await step.run(`crawl-done-${team.id}`, () => markCrawlCompleted(team.id));
     } catch (err) {
        // Ein fehlerhaftes Team killt nicht den ganzen Lauf: Fehler festhalten
        // (Operator-Diagnose unter /admin/crawler) und mit dem nächsten Team
        // weitermachen. markCrawlCompleted räumt den Fehler beim nächsten Erfolg.
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("team crawl failed", { teamId: team.id, error: msg });
        await step.run(`crawl-error-${team.id}`, () => markCrawlError(team.id, msg));
        continue;
     }
    }

    return {
      newMatches: totalNewMatches,
      updatedMatches: totalUpdatedMatches,
      scheduledMatches: totalScheduledMatches,
      skippedReadOnly,
      skippedInvalid
    };
  }
);
