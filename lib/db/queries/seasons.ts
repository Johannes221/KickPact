import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { seasons } from "@/lib/db/schema/seasons";

export type SeasonRow = typeof seasons.$inferSelect;

/**
 * Liefert die zum gegebenen Datum "aktive" Saison.
 *
 * Definition aktiv: `today` liegt im Frühbucher- + Saison-Fenster.
 * Wir akzeptieren ein erweitertes Fenster `[startsAt - 60d, endsAt + 30d]`,
 * damit die Frühbucher-Phase im Juni/Juli sowie die Nachlauf-Phase im Mai/Juni
 * abgedeckt sind.
 *
 * Falls keine Saison passt → null.
 */
export async function getActiveSeasonForDate(today: Date): Promise<SeasonRow | null> {
  const lookahead = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);
  const lookbehind = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(seasons)
    .where(
      and(
        lte(seasons.startsAt, lookbehind),
        gte(seasons.endsAt, lookahead)
      )
    )
    .orderBy(seasons.startsAt)
    .limit(1);
  return rows[0] ?? null;
}

export async function getSeasonByCode(code: string): Promise<SeasonRow | null> {
  const rows = await db
    .select()
    .from(seasons)
    .where(eq(seasons.code, code))
    .limit(1);
  return rows[0] ?? null;
}
