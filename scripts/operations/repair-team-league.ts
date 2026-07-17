/**
 * Einmal-Reparatur: `teams.league` neu bestimmen.
 *
 * Zwei Bugs hatten dafür gesorgt, dass KEIN Team eine korrekte Liga hatte
 * (2026-07-17: 6 von 6 falsch):
 *  1. Der alte Parser schrieb den Wochentag ("Sa"/"So") als Liga.
 *  2. Der neue Parser fand gar keine Liga mehr, weil fussball.de die
 *     Altersklasse weggelassen hat und die Liga seither an der Uhrzeit klebt
 *     ("19:00 Kreisliga ME") — der Uhrzeit-Guard verwarf alles.
 * Beide sind gefixt (stripLeadingTime + pickTeamLeague). Aber `updateTeamLeague`
 * überschreibt bewusst nie mit leer, deshalb bleiben die Altwerte stehen, bis
 * eine plausible Liga gefunden wird.
 *
 * Dieses Skript scrapt pro Team den Spielplan, bestimmt die Liga über
 * `pickTeamLeague` (nur Meisterschaftsspiele, häufigster Wert) und schreibt sie.
 * Findet sich keine, wird ein implausibler Altwert explizit geleert — leer ist
 * ehrlicher als "Sa". Der reguläre Crawl hält es danach von selbst aktuell.
 *
 * Idempotent. Braucht einen Netzzugriff pro Team (fetch, kein Browser).
 *
 * Lauf:  npx dotenv -e .env.local -- npx tsx scripts/operations/repair-team-league.ts [--execute]
 * Ohne --execute nur Dry-Run.
 */
import { eq, isNotNull } from "drizzle-orm";
import { db } from "../../lib/db/client";
import { teams } from "../../lib/db/schema";
import { isPlausibleLeague, pickTeamLeague } from "../../lib/utils/league";
import { getSpiele } from "../../lib/crawler/fussballde";

async function main() {
  const execute = process.argv.includes("--execute");

  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      saison: teams.saison,
      league: teams.league,
      fid: teams.fussballdeTeamId,
      slug: teams.fussballdeSlug
    })
    .from(teams)
    .where(isNotNull(teams.fussballdeTeamId));

  let changed = 0;
  for (const t of rows) {
    if (!t.fid || !t.slug) continue;
    let detected: string | null = null;
    try {
      const spiele = await getSpiele(t.fid, t.slug, t.saison);
      detected = pickTeamLeague(spiele.map((s) => s.league));
    } catch (err) {
      console.log(`  ${t.name}: Scrape-Fehler (übersprungen) — ${String(err).slice(0, 60)}`);
      continue;
    }

    const alt = t.league;
    const altOk = isPlausibleLeague(alt);
    // Nichts zu tun: entweder passt es schon, oder es ist leer und wir finden nichts.
    if (detected === alt) continue;
    if (!detected && !alt) continue;
    if (!detected && altOk) {
      // Plausibler Altwert, aber aktuell nichts gefunden (z.B. nur
      // Freundschaftsspiele gescrapt) → stehen lassen, nicht verschlechtern.
      continue;
    }

    const ziel = detected ?? null;
    console.log(`  ${t.name.padEnd(50)} "${alt ?? "—"}" → "${ziel ?? "—"}"`);
    changed++;
    if (execute) {
      await db.update(teams).set({ league: ziel }).where(eq(teams.id, t.id));
    }
  }

  if (changed === 0) {
    console.log("Nichts zu tun — alle Ligen aktuell.");
  } else if (!execute) {
    console.log(`\nDRY-RUN — ${changed} Änderung(en), nichts geschrieben. Mit --execute ausführen.`);
  } else {
    console.log(`\n${changed} Liga-Wert(e) korrigiert.`);
  }
  process.exit(0);
}

main();
