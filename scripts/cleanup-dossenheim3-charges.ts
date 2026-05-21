/**
 * Löscht alle Charges für Dossenheim 3 (falsche teamSide-Berechnung).
 */
import { db } from "../lib/db/client";
import { charges, pledges, teams } from "../lib/db/schema";
import { eq, inArray } from "drizzle-orm";

async function main() {
  const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, "ytbng7w893495ncjtog7amce")).limit(1);
  if (!team) throw new Error("Team nicht gefunden");

  const dos3Pledges = await db.select({ id: pledges.id }).from(pledges).where(eq(pledges.teamId, team.id));
  if (dos3Pledges.length === 0) { console.log("Keine Pledges → keine Charges"); return; }

  const pledgeIds = dos3Pledges.map(p => p.id);
  const result = await db.delete(charges).where(inArray(charges.pledgeId, pledgeIds));
  console.log(`✓ Charges gelöscht für ${pledgeIds.length} Pledges von Dossenheim 3`);
}

main().catch(console.error);
