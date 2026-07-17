/**
 * Einmal-Backfill: `matches.competition_type` für den Bestand setzen.
 *
 * Die Spalte kam mit Migration 0069; alle vorher gescrapten Spiele stehen auf
 * `unknown` und werden vom Geld-Gate in evaluate-match bewusst NICHT geblockt
 * (bei Unwissen weiter zu zahlen ist besser als stiller Ausfall). Damit das Gate
 * für den Bestand überhaupt greifen kann, braucht es diesen Lauf: er scrapt pro
 * Mannschaft den Spielplan (fetch, kein Browser) und ordnet über die
 * fussball.de-spiel-id den Wettbewerbstyp zu (ME/PO/FS → league/cup/friendly).
 *
 * Spiele, die der Spielplan nicht mehr liefert (getSpiele cappt bei ~10 pro
 * Abruf), bleiben `unknown` — ehrlich, statt zu raten.
 *
 * ÄNDERT KEIN GELD: bestehende Charges werden nicht angefasst. Ob auf einem
 * nachträglich als Freundschaftsspiel erkannten Spiel schon Charges liegen,
 * meldet das Skript nur — die Entscheidung darüber gehört einem Menschen.
 *
 * Idempotent. Lauf:
 *   npx dotenv -e .env.local -- npx tsx scripts/operations/backfill-competition-type.ts [--execute]
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../lib/db/client";
import { teams, matches, charges } from "../../lib/db/schema";
import { getSpiele } from "../../lib/crawler/fussballde";
import { competitionTypeOf } from "../../lib/utils/league";

async function main() {
  const execute = process.argv.includes("--execute");

  const teamRows = await db
    .select({
      id: teams.id,
      name: teams.name,
      saison: teams.saison,
      fid: teams.fussballdeTeamId,
      slug: teams.fussballdeSlug
    })
    .from(teams);

  const tally: Record<string, number> = { league: 0, cup: 0, friendly: 0, unknown: 0 };
  const friendlyWithCharges: string[] = [];

  for (const t of teamRows) {
    if (!t.fid || !t.slug) continue;
    // Nach spiel-id deduplizieren: der Spielplan-Endpunkt ignoriert den
    // saison-Parameter teilweise und liefert für beide Abrufe dieselben Spiele
    // — ohne Dedup zählt der Dry-Run jedes Spiel doppelt und meldet Unsinn.
    const byId = new Map<string, string | null>();
    try {
      // Beide Saisons abklappern: der Bestand reicht über den Saisonwechsel.
      for (const saison of new Set([t.saison, prevSaison(t.saison)])) {
        const spiele = await getSpiele(t.fid, t.slug, saison);
        for (const s of spiele) if (!byId.has(s.spielId)) byId.set(s.spielId, s.league);
      }
    } catch (err) {
      console.log(`  ${t.name}: Scrape-Fehler (übersprungen) — ${String(err).slice(0, 60)}`);
      continue;
    }
    const items = [...byId].map(([spielId, league]) => ({ spielId, league }));

    for (const it of items) {
      const typ = competitionTypeOf(it.league);
      if (typ === "unknown") continue; // nichts gelernt → nicht anfassen

      const [m] = await db
        .select({ id: matches.id, current: matches.competitionType })
        .from(matches)
        .where(
          and(eq(matches.fussballdeSpielId, it.spielId), eq(matches.teamId, t.id))
        )
        .limit(1);
      if (!m || m.current === typ) continue;

      tally[typ]++;
      if (typ === "friendly") {
        const [c] = await db
          .select({ n: sql<number>`count(*)::int` })
          .from(charges)
          .where(eq(charges.matchId, m.id));
        if (Number(c?.n ?? 0) > 0) {
          friendlyWithCharges.push(`${t.name} / ${it.spielId} (${c.n} Charges)`);
        }
      }
      if (execute) {
        await db
          .update(matches)
          .set({ competitionType: typ })
          .where(eq(matches.id, m.id));
      }
    }
  }

  const total = tally.league + tally.cup + tally.friendly;
  console.log(
    `\n${total} Spiele klassifiziert: ${tally.league} Liga, ${tally.cup} Pokal, ${tally.friendly} Freundschaft.`
  );
  const rest = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(matches)
    .where(eq(matches.competitionType, "unknown"));
  console.log(`${rest[0]?.n ?? 0} Spiele bleiben "unknown" (nicht mehr im Spielplan) — zahlen weiter.`);

  if (friendlyWithCharges.length > 0) {
    console.log(
      `\n!! ${friendlyWithCharges.length} als Freundschaftsspiel erkannte Spiele tragen bereits Charges:`
    );
    for (const f of friendlyWithCharges) console.log(`   ${f}`);
    console.log("   Diese werden NICHT automatisch angefasst — bitte manuell entscheiden.");
  }

  if (!execute) console.log("\nDRY-RUN — nichts geschrieben. Mit --execute ausführen.");
  process.exit(0);
}

/** "2627" → "2526" */
function prevSaison(code: string): string {
  const lo = parseInt(code.slice(0, 2), 10);
  const p = (lo + 99) % 100;
  return String(p).padStart(2, "0") + String(lo).padStart(2, "0");
}

main();
