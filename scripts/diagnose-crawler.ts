/**
 * Diagnose-Script: Testet getSpiele + getSpielDetails für Dossenheim 3
 * Run: cd /Users/johan/kickpact && npx dotenv -e .env.local -- npx tsx scripts/diagnose-crawler.ts
 */
import { getSpiele, getSpielDetails } from "../lib/crawler/fussballde";

const TEAM_ID = "02EPKPAL98000000VS5489B1VT0RKM5V";
const TEAM_SLUG = "fc-sportfreunde-1910-dossenheim-3-fc-sportfr-dossenheim-baden";
const SAISON = "2526";

async function main() {
  console.log("=== Diagnose: getSpiele für Dossenheim 3 ===");
  console.log(`teamId: ${TEAM_ID}`);
  console.log(`slug: ${TEAM_SLUG}`);
  console.log(`saison: ${SAISON}\n`);

  let spiele;
  try {
    spiele = await getSpiele(TEAM_ID, TEAM_SLUG, SAISON);
    console.log(`\ngetSpiele returned ${spiele.length} Spiele:`);
    for (const s of spiele) {
      console.log(`  ${s.datum}  ${s.heim} vs ${s.gast}  ID=${s.spielId}  slug=${s.slug}`);
    }
  } catch (err) {
    console.error("getSpiele FAILED:", err);
    return;
  }

  if (spiele.length === 0) {
    console.log("\n⚠️  KEINE Spiele gefunden! Mögliche Ursachen:");
    console.log("  1. AJAX-URL liefert kein HTML mit Tabellen");
    console.log("  2. Date-Filter filtert alle raus (alle Spiele in der Zukunft?)");
    console.log("  3. CSS-Selektoren haben sich geändert");
    return;
  }

  // Ersten 2 Spiele detailliert scrapen
  const toTest = spiele.slice(0, 2);
  for (const spiel of toTest) {
    console.log(`\n=== getSpielDetails: ${spiel.datum} ${spiel.heim} vs ${spiel.gast} ===`);
    console.log(`spielId=${spiel.spielId}, slug=${spiel.slug}`);
    try {
      const details = await getSpielDetails(spiel.spielId, spiel.slug);
      console.log(`Ergebnis: ${details.ergebnis.heim}:${details.ergebnis.gast}`);
      console.log(`Halbzeit: ${details.halbzeit ? `${details.halbzeit.heim}:${details.halbzeit.gast}` : "null"}`);
      console.log(`Events (${details.events.length}):`);
      for (const ev of details.events) {
        if (ev.typ === "TOR") {
          console.log(`  ${ev.minute ?? "?"}' TOR  side=${ev.side}  spielerId=${ev.spielerId ?? "MISSING"}  spielerName=${ev.spielerName ?? "MISSING"}`);
        } else {
          const rein = "rein" in ev ? ev.rein?.name : "";
          const raus = "raus" in ev ? ev.raus?.name : "";
          console.log(`  ${ev.minute ?? "?"}' AUS  side=${ev.side}  rein=${rein}  raus=${raus}`);
        }
      }
    } catch (err) {
      console.error(`getSpielDetails FAILED:`, err);
    }
  }
}

main().catch(console.error);
