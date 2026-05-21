/**
 * Fixes the club name stored from fussball.de scrape:
 * "FC Sportfr. Dossenheim 69216 Dossenheim" → "FC Sportfreunde 1910 Dossenheim"
 *
 * Run: cd /Users/johan/kickpact && npx dotenv -e .env.local -- npx tsx scripts/fix-club-name.ts
 */
import { db } from "../lib/db/client";
import { clubs } from "../lib/db/schema";
import { eq } from "drizzle-orm";

async function main() {
  const all = await db.select({ id: clubs.id, name: clubs.name, slug: clubs.slug }).from(clubs);
  console.log("Clubs vorher:", JSON.stringify(all, null, 2));

  // Fix the fussball.de-scraped name that includes postal code
  for (const club of all) {
    if (club.name.includes("69216") || club.name.includes("Dossenheim 69216")) {
      await db
        .update(clubs)
        .set({ name: "FC Sportfreunde 1910 Dossenheim" })
        .where(eq(clubs.id, club.id));
      console.log(`✓ "${club.name}" → "FC Sportfreunde 1910 Dossenheim"`);
    }
  }

  const after = await db.select({ id: clubs.id, name: clubs.name, slug: clubs.slug }).from(clubs);
  console.log("Clubs nachher:", JSON.stringify(after, null, 2));
}

main().catch(console.error).finally(() => process.exit(0));
