import { db } from "@/lib/db/client";
import { seasons } from "@/lib/db/schema/seasons";
import { sql } from "drizzle-orm";

/**
 * Seedet die initialen DFB-Saisons. Idempotent via ON CONFLICT(code).
 *
 * `matchdayFiveAt` ist eine Schätzung (~6 Wochen nach Saison-Start). Liga-genau
 * pflegbar im DB-Studio sobald Spielplan bekannt.
 *
 * Aufruf:
 *   tsx lib/db/seeds/seasons.ts
 */
export const SEASONS_SEED = [
  {
    code: "2627",
    region: "DFB",
    startsAt: new Date("2026-08-01T00:00:00Z"),
    endsAt: new Date("2027-05-31T23:59:59Z"),
    // 5. Spieltag — Default ca. 6 Wochen nach Saison-Start.
    matchdayFiveAt: new Date("2026-09-15T23:59:59Z")
  },
  {
    code: "2728",
    region: "DFB",
    startsAt: new Date("2027-08-01T00:00:00Z"),
    endsAt: new Date("2028-05-31T23:59:59Z"),
    matchdayFiveAt: new Date("2027-09-15T23:59:59Z")
  }
] as const;

export async function seedSeasons(): Promise<{ inserted: number }> {
  let inserted = 0;
  for (const s of SEASONS_SEED) {
    const res = await db
      .insert(seasons)
      .values(s)
      .onConflictDoNothing({ target: seasons.code });
    if (res.count > 0) inserted += res.count;
  }
  return { inserted };
}

// CLI-Mode: `tsx lib/db/seeds/seasons.ts`
if (process.argv[1]?.endsWith("seasons.ts")) {
  void (async () => {
    const result = await seedSeasons();
    // eslint-disable-next-line no-console
    console.log(`[seeds/seasons] inserted=${result.inserted}`);
    // Force-exit because postgres.js keeps connection pool open.
    await db.execute(sql`SELECT 1`);
    process.exit(0);
  })();
}
