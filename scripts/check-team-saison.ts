import { db } from "../lib/db/client";
import { teams } from "../lib/db/schema";

async function main() {
  const rows = await db.select({ id: teams.id, name: teams.name, saison: teams.saison, fussballdeTeamId: teams.fussballdeTeamId, fussballdeSlug: teams.fussballdeSlug }).from(teams);
  for (const r of rows) {
    console.log(`${r.name}: saison=${r.saison} teamId=${r.fussballdeTeamId} slug=${r.fussballdeSlug}`);
  }
}
main().catch(console.error).finally(() => process.exit(0));
