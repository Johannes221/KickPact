/**
 * SECURITY (M7): 90-Tage-Auto-Pause für nie verifizierte Vereine.
 *
 * Das Verifizierungs-Gate (clubs.verifiedAt) hält Rechnungen nur ZURÜCK
 * (withheld) — Charges akkumulieren bei einem unverifizierten Verein weiter.
 * Ein Impersonator könnte so beliebig viele Charges anhäufen und sie, sobald
 * die Dokumentenprüfung (irgendwann) durchgeht, rückwirkend ausgelöst sehen.
 *
 * Dieser Cron schließt die in der Trust-Payment-Spec §12 versprochene Lücke:
 * Vereine, die 90 Tage nach Onboarding-Abschluss noch NICHT verifiziert sind,
 * bekommen ihre aktiven Pledges beendet (status='ended') → keine neue
 * Charge-Akkumulation mehr (loadActivePledgeRulesForTeam filtert auf 'active').
 * Bereits aufgelaufene Charges bleiben für die manuelle Klärung erhalten.
 */

import { and, eq, isNull, lt, inArray } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import { clubs, teams, pledges, clubMemberships, users } from "@/lib/db/schema";
import { resend, MAIL_FROM } from "@/lib/mail/client";

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const baseUrl = process.env.BETTER_AUTH_URL ?? "https://kickpact.schartl.dev";

export const autoPauseUnverified = inngest.createFunction(
  { id: "auto-pause-unverified", concurrency: { limit: 1 } },
  { cron: "30 3 * * *" }, // täglich 03:30 UTC
  async ({ step, logger }) => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - NINETY_DAYS_MS);

    const stale = await step.run("find-stale-unverified-clubs", () =>
      db
        .select({ clubId: clubs.id, clubName: clubs.name, clubSlug: clubs.slug })
        .from(clubs)
        .where(
          and(
            isNull(clubs.verifiedAt),
            eq(clubs.onboardingStatus, "completed"),
            lt(clubs.createdAt, cutoff)
          )
        )
    );

    if (stale.length === 0) {
      logger.info("auto-pause-unverified: nothing to pause");
      return { clubsPaused: 0, pledgesEnded: 0 };
    }

    let pledgesEnded = 0;
    for (const club of stale) {
      const ended = await step.run(`end-pledges-${club.clubId}`, async () => {
        const teamIds = (
          await db.select({ id: teams.id }).from(teams).where(eq(teams.clubId, club.clubId))
        ).map((t) => t.id);
        if (teamIds.length === 0) return 0;

        const result = await db
          .update(pledges)
          .set({ status: "ended", endsAt: now })
          .where(and(inArray(pledges.teamId, teamIds), eq(pledges.status, "active")))
          .returning({ id: pledges.id });
        return result.length;
      });
      pledgesEnded += ended;

      if (ended === 0) continue;

      // Admins informieren (best-effort).
      await step.run(`notify-${club.clubId}`, async () => {
        const admins = await db
          .select({ email: users.email })
          .from(clubMemberships)
          .innerJoin(users, eq(clubMemberships.userId, users.id))
          .where(
            and(eq(clubMemberships.clubId, club.clubId), eq(clubMemberships.role, "admin"))
          );
        const to = admins.map((a) => a.email).filter(Boolean);
        if (to.length === 0) return;
        await resend.emails.send({
          from: MAIL_FROM,
          to,
          subject: "KickPact: Sponsoring pausiert — Verifizierung ausstehend",
          text:
            `Hi,\n\n` +
            `eurer Verein „${club.clubName}" ist seit über 90 Tagen nicht verifiziert.\n` +
            `Zum Schutz aller Beteiligten haben wir das aktive Sponsoring vorerst\n` +
            `pausiert — es werden keine neuen Beträge mehr erfasst.\n\n` +
            `Sobald ihr die Verifizierung abschließt, könnt ihr das Sponsoring wieder\n` +
            `aktivieren: ${baseUrl}/verein/${club.clubSlug}/verifikation\n\n` +
            `KickPact`,
          headers: {
            "Idempotency-Key": `auto-pause-unverified-${club.clubId}-${now.toISOString().slice(0, 10)}`
          }
        });
      });
    }

    logger.info("auto-pause-unverified done", {
      clubsPaused: stale.length,
      pledgesEnded
    });
    return { clubsPaused: stale.length, pledgesEnded };
  }
);
