/**
 * One-shot-Backfill: trägt für Alt-Matches (finished, gescrapt VOR Migration
 * 0065) die fehlenden fussball.de-team-ids nach — und korrigiert die dabei
 * aufgedeckten Fehl-Charges über den bestehenden Korrektur-Pfad.
 *
 * Warum überhaupt? Vor 0065 hatte `matches.heim_team_id/gast_team_id = NULL`,
 * also fiel `resolveTeamSide` auf das kollisionsanfällige Namens-Matching
 * (`detectTeamSide`) zurück. Bei Reserve-Derbys ("SV X II" vs "SV X III") und
 * gleicher Stadt ("TSG Weinheim" vs "FC Weinheim") kippt das auf die falsche
 * Seite → invertierter Ausgang → falsche win/loss/goal-Charges (stilles
 * Falschgeld). Der reguläre Crawl heilt das NICHT: er re-evaluiert ein Match nur
 * bei content-hash-Drift, und der Hash ändert sich hier nicht.
 *
 * Fokus (bewusst schmal): NUR Matches mit echter Namens-Kollision
 * (`matchHasNameCollision`) werden detail-gerescraped. Die breite Masse (eigener
 * Token nur im eigenen Seitennamen) ist unbetroffen und bleibt beim
 * Namens-Matching — kein unnötiger fussball.de-Traffic/Bann-Risiko.
 *
 * Pro Kollisions-Match:
 *   1. Detailseite scrapen → heim/gast-team-id (getSpielDetails liefert sie).
 *   2. IDs nachtragen (NULL-guarded → idempotent, nur echte Alt-Rows).
 *   3. Audit: alte Namens-Seite (detectTeamSide) vs neue id-Seite
 *      (resolveTeamSide). Weichen sie ab (Flip), lief die historische
 *      Evaluation auf der falschen Seite.
 *   4. Remediation über den bestehenden Pfad (KEINE stille Auto-Umbuchung):
 *      `invalidateChargesForMatch` storniert die noch nicht fakturierten
 *      Fehl-Charges und markiert die bereits fakturierten für die
 *      Admin-Korrektur-Queue (correction_flagged_at); ein re-emittiertes
 *      `match/finished` lässt `evaluate-match` mit der korrekten Seite neu
 *      rechnen. Die eigentliche Teil-Gutschrift bleibt manueller Operator-Klick.
 *
 * Getriggert manuell/Admin via Event `crawler/backfill-match-team-ids`
 * (optional `{ limit }`). Gedrosselt (step.sleep zwischen Matches) + pro Lauf
 * gedeckelt; der Rest wird beim nächsten Trigger fortgesetzt (NULL-Filter).
 */
import { inngest } from "@/lib/inngest/client";
import { getSpielDetails } from "@/lib/crawler/fussballde";
import {
  detectTeamSide,
  resolveTeamSide,
  matchHasNameCollision
} from "@/lib/crawler/team-side";
import {
  listFinishedMatchesMissingTeamIds,
  setMatchTeamIds,
  type MatchMissingTeamIds
} from "@/lib/db/queries/crawler";
import {
  getMatchChargeStatusCounts,
  invalidateChargesForMatch
} from "@/lib/db/queries/charges";

/** Max. Detail-Scrapes (= Kollisions-Matches) pro Lauf — Bann-Schutz. */
export const MAX_MATCHES_PER_RUN = 200;
/** Harte Obergrenze der geladenen NULL-Kandidaten (vor Kollisions-Filter). */
const SELECT_HARD_CAP = 20_000;
/** Drosselung zwischen zwei Detail-Scrapes. */
const THROTTLE = "500ms";

export interface TeamIdBackfillDeps {
  /** Scrapt NUR die beiden team-ids der Spiel-Detailseite. */
  scrapeTeamIds: (
    spielId: string
  ) => Promise<{ heimTeamId: string | null; gastTeamId: string | null }>;
}

export interface MatchBackfillOutcome {
  matchId: string;
  teamId: string;
  /** team-ids in dieser Ausführung geschrieben (NULL→Wert). */
  idsFilled: boolean;
  /** Detailseite lieferte nicht beide ids (Layout/Drift) → nicht geschrieben. */
  idsMissingOnPage: boolean;
  oldSide: "heim" | "gast";
  newSide: "heim" | "gast";
  /** Namens-Seite ≠ deterministische id-Seite → historische Fehl-Wertung. */
  flipped: boolean;
  /** noch nicht fakturierte Fehl-Charges, die storniert wurden. */
  chargesCancelled: number;
  /** bereits fakturierte Fehl-Charges, für die Korrektur-Queue markiert. */
  chargesFlaggedInvoiced: number;
  /** Remediation lief → `match/finished` muss re-emittiert werden. */
  needsReemit: boolean;
  error?: string;
}

const NO_SIDE = { oldSide: "gast" as const, newSide: "gast" as const, flipped: false };

/**
 * Kern pro Match (testbar, ohne Inngest-Steps): scrapen → ids nachtragen →
 * Seiten-Audit → ggf. Remediation. EMITTIERT NICHT — der Aufrufer sendet
 * `match/finished`, wenn `needsReemit` gesetzt ist (Inngest-Step-Idempotenz).
 */
export async function processMatchTeamIdBackfill(
  row: MatchMissingTeamIds,
  deps: TeamIdBackfillDeps
): Promise<MatchBackfillOutcome> {
  const base = { matchId: row.id, teamId: row.teamId };
  const names = [row.teamName, row.clubName];

  const { heimTeamId, gastTeamId } = await deps.scrapeTeamIds(row.fussballdeSpielId);

  // Beide ids nötig: eine einzelne Seite reicht nicht, um die eigene Seite
  // deterministisch aufzulösen, und ein halb-NULL-Write würde den NULL-Filter
  // aushebeln (Zeile bliebe Kandidat). Ohne beide → unangetastet lassen.
  if (!heimTeamId || !gastTeamId) {
    return {
      ...base,
      idsFilled: false,
      idsMissingOnPage: true,
      ...NO_SIDE,
      chargesCancelled: 0,
      chargesFlaggedInvoiced: 0,
      needsReemit: false
    };
  }

  const idsFilled = await setMatchTeamIds(row.id, heimTeamId, gastTeamId);

  const oldSide = detectTeamSide(names, row.heimName);
  const newSide = resolveTeamSide(
    { heimTeamId, gastTeamId, heimName: row.heimName, gastName: row.gastName },
    row.ownFussballdeTeamId,
    names
  );
  const flipped = oldSide !== newSide;

  if (!flipped) {
    return {
      ...base,
      idsFilled,
      idsMissingOnPage: false,
      oldSide,
      newSide,
      flipped: false,
      chargesCancelled: 0,
      chargesFlaggedInvoiced: 0,
      needsReemit: false
    };
  }

  // Flip ⇒ die historische Evaluation lief auf der falschen Seite. Zählen VOR
  // der Remediation, damit der Report storniert (non-invoiced) vs. für die
  // Korrektur-Queue markiert (invoiced) sauber ausweist.
  const counts = await getMatchChargeStatusCounts(row.id);
  const chargesCancelled = counts.pending_approval + counts.confirmed;
  const chargesFlaggedInvoiced = counts.invoiced;

  // Bestehender Korrektur-Pfad: storniert non-invoiced, markiert invoiced
  // (correction_flagged_at → /admin/rechnungen/korrekturen), expired Approvals.
  await invalidateChargesForMatch(row.id, "team_side_corrected");

  // Immer re-emittieren (auch bei 0 alten Charges): die korrekte Seite kann
  // Charges erzeugen, die vorher fälschlich NICHT gefeuert haben (verpasster
  // Sieg statt gebuchter Niederlage). evaluate-match ist idempotent.
  return {
    ...base,
    idsFilled,
    idsMissingOnPage: false,
    oldSide,
    newSide,
    flipped: true,
    chargesCancelled,
    chargesFlaggedInvoiced,
    needsReemit: true
  };
}

export interface TeamIdBackfillReport {
  candidatesTotal: number; // Kollisions-Matches insgesamt (vor Cap)
  processed: number;
  truncated: boolean; // mehr Kandidaten als Cap → Rest im nächsten Lauf
  idsFilled: number;
  idsMissingOnPage: number;
  flips: number;
  remediatedMatches: number;
  chargesCancelled: number;
  chargesFlaggedInvoiced: number;
  errors: number;
}

function emptyReport(): TeamIdBackfillReport {
  return {
    candidatesTotal: 0,
    processed: 0,
    truncated: false,
    idsFilled: 0,
    idsMissingOnPage: 0,
    flips: 0,
    remediatedMatches: 0,
    chargesCancelled: 0,
    chargesFlaggedInvoiced: 0,
    errors: 0
  };
}

function accumulate(report: TeamIdBackfillReport, o: MatchBackfillOutcome): void {
  report.processed++;
  if (o.error) report.errors++;
  if (o.idsFilled) report.idsFilled++;
  if (o.idsMissingOnPage) report.idsMissingOnPage++;
  if (o.flipped) report.flips++;
  if (o.needsReemit) report.remediatedMatches++;
  report.chargesCancelled += o.chargesCancelled;
  report.chargesFlaggedInvoiced += o.chargesFlaggedInvoiced;
}

/**
 * Lädt Kandidaten, filtert auf echte Namens-Kollisionen, cappt und liefert die
 * zu verarbeitende Scheibe + Gesamtzahl (für Trunkierungs-Log).
 */
export async function selectCollisionCandidates(
  limit: number
): Promise<{ total: number; slice: MatchMissingTeamIds[] }> {
  const all = await listFinishedMatchesMissingTeamIds(SELECT_HARD_CAP);
  const collisions = all.filter((m) =>
    matchHasNameCollision([m.teamName, m.clubName], m.heimName, m.gastName)
  );
  return { total: collisions.length, slice: collisions.slice(0, limit) };
}

/**
 * Testbarer Voll-Lauf ohne Inngest-Steps (injizierte Scrape- + Emit-Deps, keine
 * Drosselung). Der Inngest-Wrapper unten macht dasselbe mit Steps/step.sleep.
 */
export async function runTeamIdBackfill(
  deps: TeamIdBackfillDeps & {
    emitMatchFinished: (matchId: string, teamId: string) => Promise<void>;
  },
  opts: { limit?: number } = {}
): Promise<TeamIdBackfillReport> {
  const limit = opts.limit ?? MAX_MATCHES_PER_RUN;
  const { total, slice } = await selectCollisionCandidates(limit);
  const report = emptyReport();
  report.candidatesTotal = total;
  report.truncated = total > slice.length;

  for (const row of slice) {
    let outcome: MatchBackfillOutcome;
    try {
      outcome = await processMatchTeamIdBackfill(row, deps);
    } catch (err) {
      outcome = {
        matchId: row.id,
        teamId: row.teamId,
        idsFilled: false,
        idsMissingOnPage: false,
        ...NO_SIDE,
        chargesCancelled: 0,
        chargesFlaggedInvoiced: 0,
        needsReemit: false,
        error: err instanceof Error ? err.message : String(err)
      };
    }
    accumulate(report, outcome);
    if (outcome.needsReemit) {
      await deps.emitMatchFinished(outcome.matchId, outcome.teamId);
    }
  }
  return report;
}

export const backfillMatchTeamIds = inngest.createFunction(
  // Concurrency 1: nicht zeitkritisch, fussball.de nicht parallel treffen.
  { id: "backfill-match-team-ids", concurrency: { limit: 1 } },
  { event: "crawler/backfill-match-team-ids" },
  async ({ event, step, logger }) => {
    const limit =
      typeof event.data?.limit === "number" && event.data.limit > 0
        ? Math.min(event.data.limit as number, MAX_MATCHES_PER_RUN)
        : MAX_MATCHES_PER_RUN;

    const { total, slice } = await step.run("select-collision-candidates", () =>
      selectCollisionCandidates(limit)
    );

    const report = emptyReport();
    report.candidatesTotal = total;
    report.truncated = total > slice.length;
    if (report.truncated) {
      // Kein stiller Cap: der Rest bleibt liegen bis zum nächsten Trigger.
      logger.warn(
        "backfill-match-team-ids: mehr Kollisions-Kandidaten als Cap — Rest im nächsten Lauf",
        { total, processedCap: slice.length }
      );
    }

    for (const row of slice) {
      const outcome = await step.run(`backfill-${row.id}`, async () => {
        try {
          return await processMatchTeamIdBackfill(row, {
            scrapeTeamIds: (spielId) =>
              getSpielDetails(spielId, "").then((d) => ({
                heimTeamId: d.heimTeamId,
                gastTeamId: d.gastTeamId
              }))
          });
        } catch (err) {
          // Ein fehlgeschlagenes Match (Captcha/Netz/Layout) killt nicht den
          // ganzen Lauf — als Fehler-Outcome zurückgeben, weiter zum nächsten.
          logger.warn("backfill-match-team-ids: Match übersprungen", {
            matchId: row.id,
            error: err instanceof Error ? err.message : String(err)
          });
          return {
            matchId: row.id,
            teamId: row.teamId,
            idsFilled: false,
            idsMissingOnPage: false,
            ...NO_SIDE,
            chargesCancelled: 0,
            chargesFlaggedInvoiced: 0,
            needsReemit: false,
            error: err instanceof Error ? err.message : String(err)
          } satisfies MatchBackfillOutcome;
        }
      });

      accumulate(report, outcome);

      if (outcome.flipped) {
        logger.info("backfill-match-team-ids: Seiten-Flip korrigiert", {
          matchId: outcome.matchId,
          teamId: outcome.teamId,
          oldSide: outcome.oldSide,
          newSide: outcome.newSide,
          chargesCancelled: outcome.chargesCancelled,
          chargesFlaggedInvoiced: outcome.chargesFlaggedInvoiced
        });
      }

      if (outcome.needsReemit) {
        await step.sendEvent(`reemit-${row.id}`, {
          name: "match/finished",
          data: { matchId: outcome.matchId, teamId: outcome.teamId, updated: true }
        });
      }

      // Schonend drosseln zwischen den Detail-Scrapes.
      await step.sleep(`throttle-${row.id}`, THROTTLE);
    }

    logger.info("backfill-match-team-ids abgeschlossen", report);
    return report;
  }
);
