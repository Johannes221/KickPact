import { sql, and, eq, lt, isNull, or, inArray } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import {
  eventApprovals,
  matchEvents,
  matches,
  teams,
  clubs,
  pledgeRules,
  pledges,
  sponsors,
  users
} from "@/lib/db/schema";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { approvalReminderEmail } from "@/lib/mail/templates/approval-reminder";

function eur(cents: number) {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function eventLabel(type: string, subtype: string | null): string {
  if (type === "tor") return "Tor";
  if (type === "karte") return subtype === "rot" ? "Rote Karte" : "Gelbe Karte";
  if (type === "spezial") {
    const map: Record<string, string> = {
      kopfball: "Kopfballtor",
      hackentor: "Hackentor",
      volley: "Volley",
      elfmeter: "Elfmeter-Tor",
      assist: "Vorlage",
      man_of_match: "Spieler des Spiels"
    };
    return map[subtype ?? ""] ?? subtype ?? "Spezial";
  }
  return type;
}

export const approvalReminders = inngest.createFunction(
  { id: "approval-reminders" },
  [{ cron: "0 9 * * *" }, { event: "approvals/manual-reminder" }],
  async ({ step, logger }) => {
    // 1) Pending approvals älter als 7d, die seit ≥7d nicht erinnert wurden (oder noch nie)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const candidates = await step.run("load-candidates", async () =>
      db
        .select({
          approvalId: eventApprovals.id,
          createdAt: eventApprovals.createdAt,
          lastRemindedAt: eventApprovals.lastRemindedAt,
          reminderCount: eventApprovals.reminderCount,
          matchEventType: matchEvents.type,
          matchEventSubtype: matchEvents.subtype,
          matchEventMinute: matchEvents.minute,
          matchDatum: matches.datum,
          heimName: matches.heimName,
          gastName: matches.gastName,
          teamName: teams.name,
          clubName: clubs.name,
          clubSlug: clubs.slug,
          amountCents: pledgeRules.amountCents,
          sponsorUserId: sponsors.userId,
          sponsorName: sponsors.displayName,
          userEmail: users.email
        })
        .from(eventApprovals)
        .innerJoin(matchEvents, eq(eventApprovals.matchEventId, matchEvents.id))
        .innerJoin(matches, eq(matchEvents.matchId, matches.id))
        .innerJoin(teams, eq(matches.teamId, teams.id))
        .innerJoin(clubs, eq(teams.clubId, clubs.id))
        .innerJoin(pledgeRules, eq(eventApprovals.pledgeRuleId, pledgeRules.id))
        .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
        .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
        .innerJoin(users, eq(sponsors.userId, users.id))
        .where(
          and(
            eq(eventApprovals.status, "pending"),
            lt(eventApprovals.createdAt, sevenDaysAgo),
            or(
              isNull(eventApprovals.lastRemindedAt),
              lt(eventApprovals.lastRemindedAt, sevenDaysAgo)
            )
          )
        )
    );

    if (candidates.length === 0) {
      logger.info("Keine pending approvals älter als 7d. Skip.");
      return { remindersSent: 0, approvalsTouched: 0 };
    }

    // 2) Group by sponsorUserId
    const bySponsor = new Map<
      string,
      {
        email: string;
        name: string;
        items: typeof candidates;
      }
    >();
    for (const c of candidates) {
      const ex = bySponsor.get(c.sponsorUserId);
      if (ex) {
        ex.items.push(c);
      } else {
        bySponsor.set(c.sponsorUserId, {
          email: c.userEmail,
          name: c.sponsorName,
          items: [c]
        });
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3003";
    const inboxUrl = `${baseUrl}/sponsor/inbox`;

    let remindersSent = 0;
    let approvalsTouched = 0;

    // 3) Mail pro Sponsor
    for (const [userId, group] of bySponsor) {
      await step.run(`mail-${userId}`, async () => {
        const mail = approvalReminderEmail({
          sponsorName: group.name,
          pendingCount: group.items.length,
          items: group.items.map((i) => ({
            teamName: i.teamName,
            clubName: i.clubName,
            eventLabel: `${eventLabel(i.matchEventType, i.matchEventSubtype)}${i.matchEventMinute !== null ? ` (${i.matchEventMinute}')` : ""}`,
            amountEur: eur(i.amountCents),
            matchDate: new Date(i.matchDatum).toLocaleDateString("de-DE")
          })),
          inboxUrl
        });
        await resend.emails.send({
          from: MAIL_FROM,
          to: group.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text
        });
        remindersSent++;
      });

      // 4) Update reminder_count + last_reminded_at für alle approvals dieses sponsors
      const approvalIds = group.items.map((i) => i.approvalId);
      await step.run(`update-${userId}`, async () => {
        await db
          .update(eventApprovals)
          .set({
            lastRemindedAt: new Date(),
            reminderCount: sql`${eventApprovals.reminderCount} + 1`
          })
          .where(inArray(eventApprovals.id, approvalIds));
        approvalsTouched += approvalIds.length;
      });
    }

    return { remindersSent, approvalsTouched };
  }
);
