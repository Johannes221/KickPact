/**
 * Audit 2026-05-24 Phase 4 / Task 4.4: Session-Cleanup-Cron.
 *
 * Datenschutzerklärung verspricht: "Server-Log-Daten (IP, User-Agent,
 * Zeitstempel) maximal 30 Tage". `sessions.expires_at` ist normalerweise
 * ~7 Tage in der Zukunft beim Login — beim Logout/Ablauf bleibt der Row
 * mit IP+UA forever in der DB. Dieser Cron löscht expired Sessions, die
 * länger als 30d expired sind.
 *
 * Cron: täglich 03:30 UTC.
 */

import { lt, sql } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";

export const cleanupSessions = inngest.createFunction(
  { id: "cleanup-sessions", concurrency: { limit: 1 } },
  { cron: "30 3 * * *" }, // täglich 03:30 UTC
  async ({ step, logger }) => {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30d in der Vergangenheit

    const result = await step.run("delete-expired-sessions", () =>
      db
        .delete(sessions)
        .where(lt(sessions.expiresAt, cutoff))
        .returning({ id: sessions.id })
    );

    logger.info("cleanup-sessions done", { deleted: result.length, cutoff: cutoff.toISOString() });
    return { deleted: result.length };
  }
);
