import { eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { matches, teams, clubs, sentNotifications } from "@/lib/db/schema";
import { getTeamNotificationRecipients } from "@/lib/db/queries/notification-recipients";
import { notifyUsers } from "@/lib/notifications/deliver";

/**
 * Push: Neues Spielergebnis. Hängt sich an dasselbe `match/finished`-Event wie
 * `evaluate-match` (separate Function — evaluate-match bleibt unangetastet).
 *
 * - Nur NEUE Ergebnisse (`updated !== true`); Score-Korrekturen lösen keinen
 *   zweiten Push aus.
 * - Idempotent pro Match via `sent_notifications` (Re-Crawls).
 * - Empfänger: Mannschafts-Mitglieder + Club-Admins/Trainer + aktive Sponsoren.
 */
export const notifyMatchResult = inngest.createFunction(
  { id: "notify-match-result", name: "Push: Neues Spielergebnis", concurrency: { limit: 4 } },
  { event: "match/finished" },
  async ({ event, step, logger }) => {
    const { matchId, teamId, updated } = event.data as {
      matchId: string;
      teamId: string;
      updated?: boolean;
    };

    if (updated === true) return { skipped: "updated" };

    const fresh = await step.run("dedupe", async () => {
      const res = await db
        .insert(sentNotifications)
        .values({ kind: "push-match-result", key: matchId })
        .onConflictDoNothing()
        .returning({ key: sentNotifications.key });
      return res.length > 0;
    });
    if (!fresh) return { skipped: "duplicate" };

    const loaded = await step.run("load-match", async () => {
      const [m] = await db
        .select({
          heimName: matches.heimName,
          gastName: matches.gastName,
          ergebnisHeim: matches.ergebnisHeim,
          ergebnisGast: matches.ergebnisGast
        })
        .from(matches)
        .where(eq(matches.id, matchId))
        .limit(1);
      const [t] = await db
        .select({ teamName: teams.name, clubSlug: clubs.slug })
        .from(teams)
        .innerJoin(clubs, eq(teams.clubId, clubs.id))
        .where(eq(teams.id, teamId))
        .limit(1);
      return { m, t };
    });

    if (!loaded.m || loaded.m.ergebnisHeim == null || loaded.m.ergebnisGast == null) {
      return { skipped: "no-result" };
    }

    const recipients = await step.run("recipients", () =>
      getTeamNotificationRecipients(teamId)
    );
    if (recipients.length === 0) return { skipped: "no-recipients" };

    const score = `${loaded.m.ergebnisHeim}:${loaded.m.ergebnisGast}`;
    const link = loaded.t?.clubSlug
      ? `/verein/${loaded.t.clubSlug}/mannschaft/${teamId}`
      : null;

    await step.run("notify", () =>
      notifyUsers(recipients, {
        type: "match_result",
        title: "⚽ Neues Spielergebnis",
        body: `${loaded.m.heimName} ${score} ${loaded.m.gastName}`,
        link,
        data: { matchId, teamId }
      })
    );

    logger.info("notify-match-result done", { matchId, recipients: recipients.length });
    return { recipients: recipients.length };
  }
);
