/**
 * Vorsaison-Backfill: holt die GESPIELTEN Spiele der Vorsaison einer
 * Mannschaft (lib/crawler/vorsaison.ts, ajax.team.matchplan-Pfad) und
 * persistiert sie direkt als `finished`-Rows.
 *
 * Bewusst KEINE `match/finished`-Events: historische Spiele dürfen weder
 * Charges (evaluate-match) noch Pushes (notify-match-result) auslösen. Das
 * Pledge-Fenster-Gate würde zwar greifen, aber wir umgehen die Pipeline
 * komplett — Backfill ist reine Anzeige-Historie („Letzte Saison"-Block).
 *
 * Getriggert via Event `crawler/team.backfill` {teamId}:
 *   (a) vom Onboarding-Erstcrawl (crawl-matches), wenn das Team in seiner
 *       aktuellen Saison < 3 gespielte Spiele hat (Sommer-Onboarding), und
 *   (b) manuell/Admin.
 *
 * Idempotent über das UNIQUE auf matches.fussballdeSpielId (ON CONFLICT DO
 * NOTHING) — ein erneutes Event legt keine Duplikate an.
 */
import { inngest } from "@/lib/inngest/client";
import { getVorsaisonSpiele } from "@/lib/crawler/vorsaison";
import { getActiveTeamById } from "@/lib/db/queries/crawler";
import { insertBackfilledFinishedMatch } from "@/lib/db/queries/matches";
import { prevSaisonCode } from "@/lib/utils/saison";

export type BackfillResult = {
  teamId: string;
  prevSaison: string | null;
  found: number;
  inserted: number;
  skippedExisting: number;
  skippedReason?: "team-not-active" | "invalid-saison";
};

/**
 * Testbarer Kern (ohne Step-Maschinerie): Team laden → Vorsaison crawlen →
 * idempotent inserten. Sendet NIEMALS Events.
 */
export async function runBackfillForTeam(teamId: string): Promise<BackfillResult> {
  const team = await getActiveTeamById(teamId);
  if (!team) {
    return {
      teamId,
      prevSaison: null,
      found: 0,
      inserted: 0,
      skippedExisting: 0,
      skippedReason: "team-not-active"
    };
  }

  const prevSaison = prevSaisonCode(team.saison);
  if (!prevSaison) {
    return {
      teamId,
      prevSaison: null,
      found: 0,
      inserted: 0,
      skippedExisting: 0,
      skippedReason: "invalid-saison"
    };
  }

  const spiele = await getVorsaisonSpiele(team.fussballdeTeamId, prevSaison);

  let inserted = 0;
  let skippedExisting = 0;
  for (const spiel of spiele) {
    const res = await insertBackfilledFinishedMatch({
      teamId: team.id,
      fussballdeSpielId: spiel.spielId,
      datum: spiel.datum,
      heimName: spiel.heimName,
      gastName: spiel.gastName,
      ergebnisHeim: spiel.ergebnisHeim,
      ergebnisGast: spiel.ergebnisGast
    });
    if (res.inserted) inserted++;
    else skippedExisting++;
  }

  return { teamId, prevSaison, found: spiele.length, inserted, skippedExisting };
}

export const backfillTeamHistory = inngest.createFunction(
  // Concurrency 1: der Backfill ist nicht zeitkritisch und fussball.de soll
  // von parallelen Team-Backfills (z.B. Vereins-Onboarding mit mehreren
  // Mannschaften) nicht gleichzeitig getroffen werden.
  { id: "backfill-team-history", concurrency: { limit: 1 } },
  { event: "crawler/team.backfill" },
  async ({ event, step, logger }) => {
    const teamId =
      typeof event.data?.teamId === "string" ? (event.data.teamId as string) : null;
    if (!teamId) {
      logger.warn("backfill-team-history: Event ohne teamId — übersprungen.");
      return { skipped: true, reason: "missing-teamId" };
    }

    // Ein Step für den gesamten Backfill: die Inserts sind idempotent
    // (ON CONFLICT DO NOTHING), ein Retry des Steps ist also harmlos.
    // Captcha-Fehler aus getVorsaisonSpiele schlagen laut durch → Function
    // failed sichtbar, kein stilles Leer-Ergebnis.
    const result = await step.run(`backfill-${teamId}`, () =>
      runBackfillForTeam(teamId)
    );

    logger.info("backfill-team-history abgeschlossen", result);
    return result;
  }
);
