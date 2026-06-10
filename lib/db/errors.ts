/**
 * Unique-Constraint-Verletzung erkennen, egal wo im Error-Wrapping sie steckt.
 *
 * Drizzle (≥0.42) wickelt Query-Fehler in `DrizzleQueryError` — die
 * "duplicate key value violates unique constraint"-Meldung des Postgres-Codes
 * 23505 liegt dann auf dem gewrappten `cause`, nicht auf der Top-Level-Message
 * ("Failed query: …"). Ein reiner `err.message`-Check (so vorher in
 * evaluate-match) übersieht die Kollision und lässt den Fehler zum Inngest-Retry
 * eskalieren statt sie als idempotenten Skip zu werten. Daher: Cause-Kette
 * ablaufen und sowohl Message-Text als auch den SQLSTATE-Code prüfen.
 */
export function isUniqueViolation(err: unknown): boolean {
  let cur: unknown = err;
  while (cur instanceof Error) {
    if (/unique|duplicate/i.test(cur.message)) return true;
    if ((cur as { code?: string }).code === "23505") return true;
    cur = cur.cause;
  }
  return false;
}
