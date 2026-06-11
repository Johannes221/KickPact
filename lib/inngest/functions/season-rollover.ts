import { and, eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { currentSaisonCode, prevSaisonCode } from "@/lib/utils/saison";

/**
 * Saison-Rollover (Phase 3 / Paket R2) — „Saison-Bump statt Saison-Rows".
 *
 * Cron: 15. Juli, 04:00 UTC (nach Crawler-Resume Mitte Juli). Zählt
 * `teams.saison` auf derselben Row hoch: alle aktiven Teams, die noch auf
 * der gerade zu Ende gegangenen Saison stehen, bekommen die neue Saison.
 * Am 15.7.2026: "2526" → "2627".
 *
 * Idempotent: ein zweiter Lauf findet keine Teams mehr auf der Vorsaison
 * und macht 0 Updates.
 *
 * Manual run: `season/rollover-test` Event (optional `nowIso` für Tests).
 */
export const seasonRollover = inngest.createFunction(
  {
    id: "season-rollover",
    name: "Saison-Rollover: teams.saison bumpen (15.7.)",
    concurrency: { limit: 1 }
  },
  [{ cron: "0 4 15 7 *" }, { event: "season/rollover-test" }],
  async ({ step, logger, event }) => {
    const nowIso = (event?.data as { nowIso?: string } | undefined)?.nowIso;
    const now = nowIso ? new Date(nowIso) : new Date();

    // Am 15.7. ist currentSaisonCode bereits die NEUE Saison (Stichtag 1.7.);
    // prev = die Saison, die gerade zu Ende ging.
    const toSaison = currentSaisonCode(now);
    const fromSaison = prevSaisonCode(toSaison);
    if (!fromSaison) {
      logger.error("season-rollover: ungültiger Saison-Code", { toSaison });
      return { bumped: 0, fromSaison: null, toSaison };
    }

    const bumpedRows = await step.run("bump-teams", () =>
      db
        .update(teams)
        .set({ saison: toSaison })
        .where(and(eq(teams.isActive, true), eq(teams.saison, fromSaison)))
        .returning({ id: teams.id })
    );

    logger.info("season-rollover done", {
      bumped: bumpedRows.length,
      fromSaison,
      toSaison
    });
    return { bumped: bumpedRows.length, fromSaison, toSaison };
  }
);
