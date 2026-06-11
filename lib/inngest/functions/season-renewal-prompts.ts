import { and, eq } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { sentNotifications } from "@/lib/db/schema";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { seasonRenewalPromptEmail } from "@/lib/mail/templates/season-renewal-prompt";
import { getReplyToForClub } from "@/lib/mail/reply-to";
import {
  findPledgesEligibleForRenewal,
  findNextSeasonTeam
} from "@/lib/db/queries/season-renewal";
import { signSeasonRenewalToken } from "@/lib/auth/season-renewal-token";
import { nextSaisonCode } from "@/lib/utils/saison";

/**
 * Plan 3 Teil 2 + Phase 3 / R7 — Saison-Renewal-Prompts.
 *
 * Cron: 0 9 * * * (täglich 09:00 UTC). Findet Pledges deren `endsAt` in
 * den nächsten 30 Tagen liegt und schickt dem Sponsor eine Renewal-Mail
 * mit zwei 1-Click-Buttons (verlängern / decline; HMAC-Token-Link).
 *
 * R7 — Staffelung: maximal DREI Mails pro Pact, in den Stages 30/14/3
 * Tage vor `endsAt` (die alte season-end-reminders-Strecke mit kaputtem
 * `?renew=`-CTA ist gelöscht; diese Funktion übernimmt die Staffelung).
 * Dedupe pro Stage über `sent_notifications` mit dem Key
 * `<pledgeId>:<nextSaison>:<stage>` als atomares INSERT-ON-CONFLICT-Gate.
 * Bestands-Keys OHNE Stage-Suffix (vor R7 verschickt) zählen als
 * gesendete 30er-Stage.
 *
 * Next-Season-Resolver: Ziel-Saison aus dem aktuellen Team-Saison-String
 * (z.B. "2526" → "2627", lib/utils/saison). Nicht parseable → skip+log.
 *
 * Manual run: `pledges/season-renewal-test` Event.
 */

/** Stage anhand der verbleibenden Tage: ≤3 → "3", ≤14 → "14", sonst "30". */
function renewalStage(daysLeft: number): "3" | "14" | "30" {
  if (daysLeft <= 3) return "3";
  if (daysLeft <= 14) return "14";
  return "30";
}

export const seasonRenewalPrompts = inngest.createFunction(
  {
    id: "season-renewal-prompts",
    name: "Season Renewal Prompts",
    concurrency: { limit: 1 }
  },
  [{ cron: "0 9 * * *" }, { event: "pledges/season-renewal-test" }],
  async ({ step, logger, event }) => {
    const overrideDays = (event?.data as { daysAhead?: number } | undefined)
      ?.daysAhead;
    const daysAhead = overrideDays ?? 30;
    const now = new Date();

    const candidates = await step.run("find-eligible", () =>
      findPledgesEligibleForRenewal(now, daysAhead)
    );

    if (candidates.length === 0) {
      logger.info("no renewal candidates", { daysAhead });
      return { sent: 0, skipped: 0, eligible: 0, daysAhead };
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ??
      process.env.BETTER_AUTH_URL ??
      "https://kickpact.schartl.dev";

    let sent = 0;
    let skipped = 0;

    for (const c of candidates) {
      const nextSaison = nextSaisonCode(c.teamSaison);
      if (!nextSaison) {
        logger.warn("could not compute next saison", {
          pledgeId: c.pledgeId,
          teamSaison: c.teamSaison
        });
        skipped += 1;
        continue;
      }

      try {
        await step.run(`renewal-${c.pledgeId}`, async () => {
          // Optional: skip wenn das Ziel-Team noch gar nicht angelegt ist —
          // Renewal-Mail bringt dann nix, weil clonePledge daran scheitern
          // würde. Wir schicken aber trotzdem ein Reminder-Mail, damit der
          // Sponsor entscheidet ob er nach Anlage der Mannschaft renewt.
          // → Wenn `nextSeasonTeam` fehlt → trotzdem mail; clone-Action
          //   wird dann den Fehler dem User zeigen.
          await findNextSeasonTeam(c.teamId, nextSaison); // touch (no-op check)

          // Stage aus den verbleibenden Tagen (Inngest serialisiert Dates
          // über step-Boundaries als ISO-Strings — defensiv normalisieren).
          const endsAtRawForStage = c.endsAt as unknown as Date | string;
          const endsAtForStage =
            endsAtRawForStage instanceof Date
              ? endsAtRawForStage
              : new Date(endsAtRawForStage);
          const daysLeft = Math.ceil(
            (endsAtForStage.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
          );
          const stage = renewalStage(daysLeft);

          // Abwärtskompatibilität: Bestands-Keys ohne Stage-Suffix stammen
          // aus der Zeit vor R7 und gelten als gesendete 30er-Stage.
          if (stage === "30") {
            const legacyKey = `${c.pledgeId}:${nextSaison}`;
            const [legacy] = await db
              .select({ key: sentNotifications.key })
              .from(sentNotifications)
              .where(
                and(
                  eq(sentNotifications.kind, "season-renewal"),
                  eq(sentNotifications.key, legacyKey)
                )
              )
              .limit(1);
            if (legacy) {
              skipped += 1;
              return;
            }
          }

          // Dedupe-Gate (pro Stage)
          const dedupeKey = `${c.pledgeId}:${nextSaison}:${stage}`;
          const gate = await db
            .insert(sentNotifications)
            .values({ kind: "season-renewal", key: dedupeKey })
            .onConflictDoNothing()
            .returning({ key: sentNotifications.key });
          if (gate.length === 0) {
            skipped += 1;
            return;
          }

          // Token (TTL bis Saisonende des aktuellen Pledges + 60 Tage,
          // damit der Sponsor genug Zeit hat). Inngest serialisiert Dates
          // über step-Boundaries als ISO-Strings — defensiv normalisieren.
          const endsAtRaw = c.endsAt as unknown as Date | string;
          const endsAtDate =
            endsAtRaw instanceof Date ? endsAtRaw : new Date(endsAtRaw);
          const ttlSec =
            Math.ceil((endsAtDate.getTime() - now.getTime()) / 1000) +
            60 * 24 * 60 * 60;
          const iat = Math.floor(now.getTime() / 1000);
          const renewToken = signSeasonRenewalToken({
            pledgeId: c.pledgeId,
            nextSaison,
            iat,
            exp: iat + ttlSec
          });

          const renewUrl = `${baseUrl.replace(/\/$/, "")}/season-renewal/${encodeURIComponent(renewToken)}?action=renew`;
          const declineUrl = `${baseUrl.replace(/\/$/, "")}/season-renewal/${encodeURIComponent(renewToken)}?action=decline`;

          const mail = seasonRenewalPromptEmail({
            sponsorName: c.sponsorDisplayName,
            teamName: c.teamName,
            clubName: c.clubName,
            currentSaison: c.teamSaison,
            nextSaison,
            endsAt: endsAtDate,
            renewUrl,
            declineUrl
          });

          const replyTo = await getReplyToForClub(c.clubId);
          const result = await resend.emails.send({
            from: MAIL_FROM,
            to: c.sponsorEmail,
            replyTo,
            subject: mail.subject,
            text: mail.text,
            html: mail.html
          });
          if (result.error) {
            logger.error("season-renewal mail failed", {
              pledgeId: c.pledgeId,
              error: result.error
            });
            // Rollback Dedupe-Gate, damit ein Retry am nächsten Tag möglich ist
            await db
              .delete(sentNotifications)
              .where(
                and(
                  eq(sentNotifications.kind, "season-renewal"),
                  eq(sentNotifications.key, dedupeKey)
                )
              );
            return;
          }
          sent += 1;
        });
      } catch (err) {
        logger.error("season-renewal loop error", {
          pledgeId: c.pledgeId,
          error: String(err)
        });
      }
    }

    logger.info("season-renewal-prompts done", {
      sent,
      skipped,
      eligible: candidates.length,
      daysAhead
    });
    return { sent, skipped, eligible: candidates.length, daysAhead };
  }
);
