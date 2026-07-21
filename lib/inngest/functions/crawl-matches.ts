import { inngest } from "@/lib/inngest/client";
import {
  getSpiele,
  getSpielDetails,
  computeMatchHash,
  getSquadAcrossSeasons,
  fetchCrestBytes,
  type SpielDetails
} from "@/lib/crawler/fussballde";
import {
  syncClubCrests,
  backfillTeamLogoFromCrest
} from "@/lib/db/queries/club-crests";
import { storeDocument } from "@/lib/storage/documents";
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
  updateTeamLeague,
  updateTeamCoverage,
  persistKader,
  countRosterPlayersWithId,
  markMatchDriftFrozen,
  type ActiveTeam
} from "@/lib/db/queries/crawler";
import { classifyScrapedMatches } from "@/lib/crawler/coverage";
import { invalidateChargesForMatch } from "@/lib/db/queries/charges";
import { isResultCorrection } from "@/lib/crawler/match-finished-event";
import {
  upsertScheduledMatch,
  shouldBackfillTeamHistory
} from "@/lib/db/queries/matches";
import {
  getSubscriptionGateForTeam,
  isCrawlBlockedByGate
} from "@/lib/db/queries/subscription-status";
import { isCrawlerSommerpause } from "@/lib/utils/sommerpause";
import { pickTeamLeague } from "@/lib/utils/league";
import { getCachedStandings } from "@/lib/recap/standings-cache";
import { getStoredStandings } from "@/lib/db/queries/standings";

/** Mindestalter, bevor der Crawl die Liga-Tabelle neu holt (siehe Step unten). */
const STANDINGS_CRAWL_MIN_AGE_MS = 20 * 60 * 60 * 1000; // 20 h → max. 1×/Tag

export const crawlMatches = inngest.createFunction(
  { id: "crawl-matches", concurrency: { limit: 2 } },
  [
    // Spieltag-orientierter Crawl-Rhythmus (UTC; +2h = CEST in der Sommerzeit):
    //  - Täglich 07:00 UTC (~09:00 CEST): Mop-up — was über Nacht eingetragen
    //    wurde, ist spätestens am Folgetag drin (auch Mi/Fr-Nachholspiele).
    //  - Sa+So 13/16/19 UTC (~15/18/21 CEST): Amateurfußball wird Sa/So gespielt,
    //    Ergebnisse trudeln nachmittags/abends ein → mehrfach crawlen, damit sie
    //    zeitnah im Dashboard stehen, statt erst am nächsten Tag.
    // Frequenz an Spieltagen hoch, unter der Woche niedrig → wenig Leerläufe,
    // geringeres fussball.de-Bann-Risiko. getActiveTeams() deckt ALLE
    // registrierten, aktiven Mannschaften ab (eine pro KickPact-Onboarding).
    { cron: "0 7 * * *" },
    { cron: "0 13,16,19 * * 6,0" },
    { event: "crawler/manual" },
    { event: "crawler/team.crawl" }
  ],
  async ({ event, step, logger }) => {
    // Sommerpause-Guard: Cron-Runs werden während der Crawler-Sommerpause
    // (Mitte Juni bis Mitte Juli) übersprungen. Anfang Juni läuft der Crawler
    // noch (Saison-Finale/Relegation), ab Mitte Juli wieder,
    // um die neuen Saison-Spielpläne (scheduled-Stubs) vor Saisonauftakt zu
    // erfassen — engeres Fenster als die Billing-Sommerpause.
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
    let totalFrozenForCorrection = 0;
    let skippedReadOnly = 0;
    let skippedInvalid = 0;
    for (const team of targetTeams) {
     try {
      // Crawl-Start markieren → Dashboard zeigt das „Spiele werden geladen"-
      // Banner für die Dauer dieses Laufs (siehe lib/crawler/crawl-status.ts).
      await step.run(`crawl-start-${team.id}`, () => markCrawlStarted(team.id));

      // Phase 3 / R6: NUR echt gekündigte Clubs (cancelled OHNE
      // trial_expired-Reason) werden übersprungen. Abgelaufene Trials,
      // paused (Sommerpause) und past_due crawlen weiter — die Daten fließen,
      // die App bleibt lebendig und der Verein kann jederzeit konvertieren.
      // Geld bleibt geschützt: evaluate-match hat sein eigenes Gate
      // (isChargeBlockedByGate) und erzeugt für unlizenzierte Clubs keine
      // Charges. Beim ersten Cron nach Reaktivierung eines cancelled-Clubs
      // läuft der Crawler komplett durch, Hash-Vergleich detected den Drift,
      // und alles wird konsistent neu aufgebaut.
      // Team-scoped: löst den effektiven Lizenz-Verein auf
      // (licensedUnderClubId ?? clubId). Ein per Transfer angehängtes Team
      // bleibt so gecrawlt, auch wenn sein alter Container gekündigt wurde.
      const gate = await step.run(`gate-${team.id}`, () =>
        getSubscriptionGateForTeam(team.id)
      );
      if (isCrawlBlockedByGate(gate)) {
        logger.info("skipped because club is cancelled", {
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
          // Teurer Kader-Scrape nur, wenn der Roster noch nicht aus einem
          // früheren Squad-Scrape befüllt ist: getKader löst bei veröffentlichten
          // Kadern bis ~50 fussball.de-Profilseiten auf — pro Crawl-Lauf wäre das
          // ein Ban-Risiko. Neue Spieler kommen incrementell über Torschützen
          // (writeMatchEvents) dazu; private Kader liefern ohnehin 0 (1 Fetch).
          if ((await countRosterPlayersWithId(team.id)) >= 8) return 0;
          // Bewusst über mehrere Saisons: lieber Ex-Spieler zu viel im Pool als
          // einer zu wenig (Spieler-Pacts). team-id ist saisonstabil.
          const kader = await getSquadAcrossSeasons(
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

      // Liga/Spielklasse aus den Listen-Items (carry-over aus der
      // `row-competition`-Zeile). Die HÄUFIGSTE nehmen, nicht die erste:
      // prev.games liefert das jüngste Spiel zuerst, in der Sommerpause also ein
      // Freundschaftsspiel — „Kreisfreundschaftsspiele FS" wäre dann die Liga.
      // updateTeamLeague überschreibt eine bestehende Liga NIE mit leer.
      const detectedLeague = pickTeamLeague(spiele.map((s) => s.league));
      if (detectedLeague) {
        await step.run(`league-${team.id}`, () =>
          updateTeamLeague(team.id, detectedLeague)
        );
      }

      // Vereinswappen aus den Spielplan-Zeilen cachen — beide Seiten jeder
      // Partie, also auch die GEGNER, die selbst keine KickPact-Mannschaft sind.
      // syncClubCrests lädt jedes Wappen höchstens einmal (Guard auf
      // sourceUrl) → kein Download-Sturm bei jedem Cron. Best-effort: ein
      // Wappen ist kosmetisch, ein Fehler darf den Match-Crawl nicht kippen.
      await step.run(`crests-${team.id}`, async () => {
        try {
          const crests = spiele.flatMap((s) => s.crests);
          const synced = await syncClubCrests(crests, async (crest) => {
            const dl = await fetchCrestBytes(crest.url);
            if (!dl) return null;
            return storeDocument(`crests/${crest.teamId}.png`, dl.bytes, dl.contentType);
          });
          // Eigenes Wappen automatisch als Team-Logo setzen, solange keins
          // hochgeladen wurde (Upload gewinnt, wird nie überschrieben).
          await backfillTeamLogoFromCrest(team.id, team.fussballdeTeamId);
          return synced;
        } catch (err) {
          logger.warn("crest sync failed (non-fatal)", {
            teamId: team.id,
            err: String(err)
          });
          return 0;
        }
      });

      // Liga-Tabelle der laufenden Saison im Hintergrund warmhalten. Sie ist die
      // einzige Quelle für die VOLLE Saison: getSpiele cappt bei ~10 Spielen,
      // eine mitten in der Saison onboardete Mannschaft bekommt die früheren
      // Spieltage also nie und zeigte sonst dauerhaft eine Teil-Bilanz als
      // Saison-Bilanz (Dashboard + öffentliches Profil, /m/[slug] ist öffentlich).
      // Der Request-Pfad liest dafür nur noch die DB.
      //
      // HÖCHSTENS 1×/Tag/Mannschaft: anders als der Rest dieser Schleife ist
      // getLeagueStandings NICHT fetch-basiert, sondern der einzige Aufruf mit
      // echtem Browser (~6–30 s Chromium-Start + bis zu 3 Seiten). Die 12h-TTL
      // des Caches ist auf die Story-Vorschau gemünzt; mit dem Wochenend-Cron
      // (07/13/16/19 Uhr) liefe der Scrape sonst mehrfach täglich pro Team —
      // dieselbe Ban-Risiko-Überlegung wie beim Kader-Scrape oben. Die Tabelle
      // ändert sich ohnehin nur, wenn gespielt wurde.
      // Best-effort: getCachedStandings wirft nie.
      await step.run(`standings-${team.id}`, async () => {
        const stored = await getStoredStandings(team.id, team.saison);
        const ageMs = stored ? Date.now() - stored.scrapedAt.getTime() : Infinity;
        // Wappen-Backfill hat Vorrang vor dem Freshness-Guard: hat die
        // gespeicherte Tabelle noch KEINE Wappen (Alt-Daten von vor dem
        // Liga-Wappen-Feature), einmal neu scrapen, auch wenn sie „frisch" ist —
        // sonst zeigt die Story-Vorschau bis zu 20 h weiter Kürzel. Sobald die
        // Wappen einmal drin sind, greift der Guard wieder normal (selbstlimitierend).
        const hasCrests = Boolean(stored?.data.rows.some((r) => r.crestUrl));
        if (ageMs < STANDINGS_CRAWL_MIN_AGE_MS && hasCrests) return { skipped: "fresh" };
        const s = await getCachedStandings(team.id, team.saison);

        // Wappen ALLER Ligavereine aus der Tabelle cachen — nicht nur die
        // Gegner aus dem Spielplan (die oben schon gelaufen sind). So zeigt die
        // Story-Vorschau auch für noch nicht angesetzte Ligagegner ihr echtes
        // Wappen statt des Kürzels. syncClubCrests lädt jedes Wappen höchstens
        // einmal (sourceUrl-Guard) → kein Download-Sturm. Best-effort: ein
        // Wappen ist kosmetisch, ein Fehler darf den Standings-Step nicht kippen.
        let crestsSynced = 0;
        try {
          const crests = (s?.rows ?? [])
            .filter((r): r is typeof r & { teamId: string; crestUrl: string } =>
              Boolean(r.teamId) && Boolean(r.crestUrl)
            )
            .map((r) => ({ teamId: r.teamId, url: r.crestUrl, name: r.teamName }));
          crestsSynced = await syncClubCrests(crests, async (crest) => {
            const dl = await fetchCrestBytes(crest.url);
            if (!dl) return null;
            return storeDocument(`crests/${crest.teamId}.png`, dl.bytes, dl.contentType);
          });
        } catch (err) {
          logger.warn("league-table crest sync failed (non-fatal)", {
            teamId: team.id,
            err: String(err)
          });
        }

        return {
          rows: s?.rows.length ?? 0,
          ownRow: Boolean(s?.ownRow),
          crestsSynced
        };
      });

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

      // Gescrapte Detail-Daten der gespielten Spiele sammeln → Daten-Coverage
      // klassifizieren (benannte Torschützen? nur Ergebnis?). Nach der Schleife
      // einmal pro Team persistiert (updateTeamCoverage hebt nie unter den
      // Namens-Floor, schärft also C-/D-Jugend bei vorhandenen Torschützen auf
      // `full`). Siehe lib/crawler/coverage.ts.
      const scrapedDetails: SpielDetails[] = [];

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

        scrapedDetails.push(details);

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
          const invalidation = await step.run(
            `invalidate-charges-${spiel.spielId}`,
            () =>
              invalidateChargesForMatch(existing.id, "match_updated", {
                // Freeze-Modus: trägt das Spiel schon fakturierte Charges, dürfen
                // die NICHT-fakturierten NICHT storniert werden — der Freeze-Guard
                // unten überspringt Re-Import + Re-Emit, sie würden sonst still
                // verloren gehen (Review-Befund 2026-07-10).
                freezeNonInvoicedIfInvoiced: true
              })
          );

          // Freeze-Guard (Daten-Integrität): Hat das Spiel bereits FAKTURIERTE
          // Charges, ist der Hash-Drift ein Korrektur-Fall — die invoiced-Charges
          // wurden gerade nur geflaggt (Review-Queue), NICHT storniert. Wir
          // dürfen jetzt NICHT die Scraped-Events löschen/neu schreiben:
          // updateMatchWithEvents würde per FK `matchEventId onDelete:set null`
          // die eingefrorenen Charges verwaisen → partieller Unique-Index
          // kollidiert (Pipeline-Crash bei ≥2 Toren) bzw. Re-Eval erzeugt eine
          // zweite Charge fürs selbe Tor (Doppelbuchung). Score/Events bleiben
          // eingefroren, bis der Operator die Korrektur-Queue abarbeitet.
          if (invalidation.frozenInvoiced > 0) {
            logger.warn(
              "match update frozen: bereits fakturierte Charges → nur für Korrektur-Queue geflaggt, kein Auto-Update",
              {
                matchId: existing.id,
                teamId: team.id,
                frozenInvoiced: invalidation.frozenInvoiced
              }
            );
            totalFrozenForCorrection++;
            // contentHash fortschreiben (Events/Score bleiben eingefroren):
            // sonst erkennt jeder Folge-Crawl denselben Drift neu, re-flaggt die
            // invoiced-Charges und macht ein operator-seitiges „Verwerfen"
            // (dismissChargeCorrections) jede Nacht rückgängig (Oszillation).
            // Ein echter Re-Drift (anderer Hash) wird weiterhin erkannt.
            await step.run(`freeze-hash-${spiel.spielId}`, () =>
              markMatchDriftFrozen(existing.id, newHash)
            );
            continue;
          }

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
            data: {
              matchId: existing.id,
              teamId: team.id,
              // Stub-Finalisierung (contentHash === null) ist das ERSTE Ergebnis
              // → updated:false → Ergebnis-Push feuert (Dedupe schützt gegen
              // Doppel). Nur echte Nachkorrektur bleibt updated:true (still).
              updated: isResultCorrection(existing.contentHash)
            }
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

      // Daten-Coverage aus den gescrapten Spielen nachschärfen (nur wenn
      // tatsächlich gespielte Spiele vorlagen — sonst kein Signal).
      if (scrapedDetails.length > 0) {
        await step.run(`coverage-${team.id}`, () =>
          updateTeamCoverage(team.id, classifyScrapedMatches(scrapedDetails))
        );
      }

      // Team fertig gecrawlt → Banner kann ausgeblendet werden.
      await step.run(`crawl-done-${team.id}`, () => markCrawlCompleted(team.id));

      // Onboarding-/Einzel-Team-Crawl: hat das Team in seiner aktuellen
      // Saison < 3 gespielte Spiele (Sommer-Onboarding, Saisonstart) und noch
      // keine Historie → Vorsaison-Backfill anstoßen, damit Dashboard +
      // öffentliches Profil sofort „Letzte Saison" zeigen können. Der
      // Backfill-Job emittiert selbst KEINE match/finished-Events (keine
      // Charges/Pushes) — siehe backfill-team-history.ts.
      if (requestedTeamId) {
        const wantsBackfill = await step.run(`backfill-check-${team.id}`, () =>
          shouldBackfillTeamHistory(team.id)
        );
        if (wantsBackfill) {
          await step.sendEvent(`emit-backfill-${team.id}`, {
            name: "crawler/team.backfill",
            data: { teamId: team.id }
          });
          logger.info("vorsaison-backfill angestoßen", { teamId: team.id });
        }
      }
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
      frozenForCorrection: totalFrozenForCorrection,
      skippedReadOnly,
      skippedInvalid
    };
  }
);
