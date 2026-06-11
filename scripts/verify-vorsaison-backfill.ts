/**
 * Dry-Run-Verifikation des Vorsaison-Backfill-Crawlers (Paket S, Task S5).
 *
 * Ruft getVorsaisonSpiele LIVE gegen fussball.de auf und printet NUR den
 * Count + die ersten 5 Spiele — es wird NICHTS in die DB geschrieben.
 *
 * Aufruf (bewusst manuell, nicht automatisiert — 2 Live-Requests):
 *   ONLY_TEAM=<fussballdeTeamId> SAISON=<code> npx tsx scripts/verify-vorsaison-backfill.ts
 *
 * Beispiel:
 *   ONLY_TEAM=011MIAE8VG000000VTVG0001VTR8C1K7 SAISON=2526 \
 *     npx tsx scripts/verify-vorsaison-backfill.ts
 */
import { getVorsaisonSpiele } from "../lib/crawler/vorsaison";

async function main() {
  const teamId = process.env.ONLY_TEAM;
  const saison = process.env.SAISON;
  if (!teamId || !saison) {
    console.error(
      "Usage: ONLY_TEAM=<fussballdeTeamId> SAISON=<code z.B. 2526> npx tsx scripts/verify-vorsaison-backfill.ts"
    );
    process.exit(1);
  }

  console.log(`Dry-Run: getVorsaisonSpiele(${teamId}, ${saison}) — kein DB-Write.`);
  const spiele = await getVorsaisonSpiele(teamId, saison);

  console.log(`\n${spiele.length} Spiele mit Endstand gefunden.`);
  for (const s of spiele.slice(0, 5)) {
    console.log(
      `  ${s.datum}  ${s.heimName} ${s.ergebnisHeim}:${s.ergebnisGast} ${s.gastName}  (${s.spielId})`
    );
  }
  if (spiele.length > 5) console.log(`  … und ${spiele.length - 5} weitere.`);
}

main().catch((err) => {
  console.error("Dry-Run fehlgeschlagen:", err instanceof Error ? err.message : err);
  process.exit(2);
});
