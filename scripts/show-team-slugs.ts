import { db } from "../lib/db/client";
import { teams } from "../lib/db/schema/clubs";

async function main() {
  const rows = await db.select({ id: teams.id, name: teams.name, fussballdeTeamId: teams.fussballdeTeamId, fussballdeSlug: teams.fussballdeSlug }).from(teams);
  for (const r of rows) {
    console.log(`name: ${r.name}`);
    console.log(`  id: ${r.id}`);
    console.log(`  fussballdeTeamId: ${r.fussballdeTeamId}`);
    console.log(`  fussballdeSlug: ${r.fussballdeSlug ?? "NULL"}`);
    console.log();
  }
  process.exit(0);
}
main().catch(console.error);
