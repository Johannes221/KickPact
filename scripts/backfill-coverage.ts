/**
 * Backfill der Daten-Coverage (teams.data_coverage) für bestehende Mannschaften.
 *
 * Klassifiziert jede aktive Mannschaft per Live-Probe gegen fußball.de
 * (detectTeamCoverage) und schreibt das Ergebnis via updateTeamCoverage — das
 * kombiniert mit dem Namens-Floor und schreibt nie unter ihn (Herren bleibt
 * `full`, auch wenn ein torarmer Spieltag gesampelt wird). Laufende Pacts bleiben
 * unangetastet (Bestand schonen).
 *
 * Lauf (gegen Staging/Live-DB, siehe feedback_no_local_run):
 *   npx dotenv -e .env.local -- npx tsx scripts/backfill-coverage.ts
 *
 * Optional auf ein Team begrenzen:  ONLY_TEAM=<fussballdeTeamId> npx tsx …
 */
import { getActiveTeams, updateTeamCoverage } from "../lib/db/queries/crawler";
import { detectTeamCoverage } from "../lib/crawler/coverage";

const TEAM_DELAY_MS = 800; // höflich gegenüber fußball.de

async function main() {
  const only = process.env.ONLY_TEAM?.trim();
  let teams = await getActiveTeams();
  if (only) teams = teams.filter((t) => t.fussballdeTeamId === only);

  console.log(`Backfill Coverage für ${teams.length} aktive Mannschaft(en)\n`);
  const tally: Record<string, number> = {};

  for (let i = 0; i < teams.length; i++) {
    const t = teams[i];
    try {
      const signal = await detectTeamCoverage(
        t.fussballdeTeamId,
        t.fussballdeSlug,
        t.saison
      );
      await updateTeamCoverage(t.id, signal);
      tally[signal] = (tally[signal] ?? 0) + 1;
      console.log(`[${i + 1}/${teams.length}] ${signal.padEnd(13)} ${t.name}`);
    } catch (err) {
      console.error(`[${i + 1}/${teams.length}] FEHLER ${t.name}: ${err}`);
    }
    await new Promise((r) => setTimeout(r, TEAM_DELAY_MS));
  }

  console.log(
    `\nFertig. Signale: ${Object.entries(tally)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")}`
  );
  console.log(
    "Hinweis: gespeicherter Wert = max(Namens-Floor, Signal, bisheriger Wert) je Team."
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
