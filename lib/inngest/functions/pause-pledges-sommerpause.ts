import { eq, and } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { pledges } from "@/lib/db/schema";

/**
 * Sommerpause-Start: 1. Juni, 03:00 UTC.
 *
 * Setzt alle aktiven Pledges auf `paused` und markiert `sommerpause_paused = true`.
 * Der Resume-Cron reaktiviert NUR Pledges mit diesem Flag — dadurch werden
 * sponsor-manuell-pausierte Pledges nicht versehentlich reaktiviert.
 */
export const pausePledgesSommerpause = inngest.createFunction(
  {
    id: "pause-pledges-sommerpause",
    name: "Sommerpause: Aktive Pledges pausieren (1.6.)",
    concurrency: { limit: 1, key: "pledge-sommerpause-lifecycle" }
  },
  [
    { cron: "0 3 1 6 *" },
    { event: "pledges/pause-sommerpause-test" }
  ],
  async ({ logger }) => {
    const result = await db
      .update(pledges)
      .set({ status: "paused", sommerpausePaused: true })
      .where(
        and(
          eq(pledges.status, "active"),
          eq(pledges.sommerpausePaused, false)
        )
      )
      .returning({ id: pledges.id });

    logger.info("pause-pledges-sommerpause done", { paused: result.length });
    return { paused: result.length };
  }
);
