import { and, desc, eq, gte, lte } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { seasons } from "@/lib/db/schema/seasons";
import { teams } from "@/lib/db/schema/clubs";

export type SeasonRow = typeof seasons.$inferSelect;

/**
 * Liefert die zum gegebenen Datum "aktive" Saison.
 *
 * REVIEW K1 (2026-06-11): Bevorzugt wird die früheste Saison, die noch NICHT
 * vorbei ist (laufend oder in <=30 Tagen startend = Frühbucher-Fenster).
 * Die alte Variante nahm im erweiterten Fenster die ÄLTESTE Row — sobald die
 * 2526-Row geseedet war, gewann sie den ganzen Juli/August gegen 2627 und
 * sperrte via matchdayFiveAt (15.9.2025!) das komplette Saison-Wetten-Window
 * der Frühbucher-Phase.
 *
 * Fallback (keine laufende/kommende Saison im Fenster): die jüngst beendete
 * Saison bis 60 Tage nach endsAt (Renewal-/Nachlauf-Phase).
 *
 * Falls keine Saison passt → null.
 */
export async function getActiveSeasonForDate(today: Date): Promise<SeasonRow | null> {
  const lookbehind = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const current = await db
    .select()
    .from(seasons)
    .where(and(lte(seasons.startsAt, lookbehind), gte(seasons.endsAt, today)))
    .orderBy(seasons.startsAt)
    .limit(1);
  if (current[0]) return current[0];

  const grace = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);
  const recent = await db
    .select()
    .from(seasons)
    .where(and(lte(seasons.startsAt, today), gte(seasons.endsAt, grace)))
    .orderBy(desc(seasons.startsAt))
    .limit(1);
  return recent[0] ?? null;
}

export async function getSeasonByCode(code: string): Promise<SeasonRow | null> {
  const rows = await db
    .select()
    .from(seasons)
    .where(eq(seasons.code, code))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Saison-Code (`teams.saison`, z.B. "2627") einer Mannschaft — Quelle für das
 * team-bezogene Saison-Wetten-Fenster (W1.2). `null` bei unbekanntem Team.
 */
export async function getTeamSaison(teamId: string): Promise<string | null> {
  const rows = await db
    .select({ saison: teams.saison })
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  return rows[0]?.saison ?? null;
}
