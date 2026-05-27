import { eq, and } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { pledges } from "@/lib/db/schema";

/**
 * Sommerpause-Ende: 1. August, 03:00 UTC.
 *
 * Reaktiviert NUR Pledges die vom Sommerpause-Cron (1.6.) automatisch pausiert wurden
 * (`sommerpause_paused = true`). Sponsor-manuell-pausierte Pledges bleiben unberührt.
 */
export const resumePledgesSommerpause = inngest.createFunction(
  {
    id: "resume-pledges-sommerpause",
    name: "Sommerpause-Ende: Pledges reaktivieren (1.8.)",
    concurrency: { limit: 1, key: "pledge-sommerpause-lifecycle" }
  },
  [
    { cron: "0 3 1 8 *" },
    { event: "pledges/resume-sommerpause-test" }
  ],
  async ({ logger }) => {
    const result = await db
      .update(pledges)
      .set({ status: "active", sommerpausePaused: false })
      .where(
        and(
          eq(pledges.status, "paused"),
          eq(pledges.sommerpausePaused, true)
        )
      )
      .returning({ id: pledges.id });

    logger.info("resume-pledges-sommerpause done", { resumed: result.length });
    return { resumed: result.length };
  }
);
