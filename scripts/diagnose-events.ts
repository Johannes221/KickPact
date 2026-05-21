/**
 * Diagnose: zeigt alle Events der Dossenheim-3 Matches mit side-Zuordnung
 */
import { db } from "../lib/db/client";
import { teams, matches, matchEvents } from "../lib/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const [team] = await db.select().from(teams).where(eq(teams.id, "ytbng7w893495ncjtog7amce")).limit(1);
  const allMatches = await db.select().from(matches).where(eq(matches.teamId, team.id));

  for (const m of allMatches.slice(0, 4)) {
    const events = await db.select().from(matchEvents).where(eq(matchEvents.matchId, m.id));
    const torEvents = events.filter(e => e.type === "tor");
    if (torEvents.length === 0) continue;

    console.log(`\n${new Date(m.datum).toISOString().split('T')[0]} ${m.heimName} ${m.ergebnisHeim}:${m.ergebnisGast} ${m.gastName}`);
    console.log(`  Tore (${torEvents.length}):`);
    for (const e of torEvents) {
      console.log(`    ${e.minute ?? '?'}' side=${e.side} ${e.playerName ?? '?'} (id=${e.id})`);
    }

    // teamSide logic
    const teamFirstWord = team.name.toLowerCase().split(" ")[0];
    const isHeim = m.heimName.toLowerCase().includes(teamFirstWord);
    const teamSide = isHeim ? "heim" : "gast";
    const ownGoals = torEvents.filter(e => e.side === teamSide);
    console.log(`  teamSide=${teamSide} → ownGoals: ${ownGoals.length}`);
  }
}

main().catch(console.error);
