import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

export type StatusTableCounts = Record<string, number>;

/**
 * Zählt die Kern-Tabellen für das Status-Dashboard (/status). Liefert bei
 * DB-Fehler `{ ok: false }` statt zu werfen — die Seite ist ein Health-Probe.
 */
export async function getStatusTableCounts(): Promise<
  { ok: true; stats: StatusTableCounts } | { ok: false; error: string }
> {
  try {
    const result = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM users)::int               AS users,
        (SELECT COUNT(*) FROM clubs)::int               AS clubs,
        (SELECT COUNT(*) FROM teams)::int               AS teams,
        (SELECT COUNT(*) FROM players)::int             AS players,
        (SELECT COUNT(*) FROM sponsors)::int            AS sponsors,
        (SELECT COUNT(*) FROM pledges)::int             AS pledges,
        (SELECT COUNT(*) FROM pledge_rules)::int        AS pledge_rules,
        (SELECT COUNT(*) FROM matches)::int             AS matches,
        (SELECT COUNT(*) FROM match_events)::int        AS match_events,
        (SELECT COUNT(*) FROM charges)::int             AS charges,
        (SELECT COUNT(*) FROM invoices)::int            AS invoices,
        (SELECT COUNT(*) FROM subscriptions)::int       AS subscriptions
    `);
    const row = result[0] as unknown as StatusTableCounts;
    return { ok: true, stats: row };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
