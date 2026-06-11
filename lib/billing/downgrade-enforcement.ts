import "server-only";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clubMemberships,
  clubs,
  pledgeRules,
  pledges,
  teams,
  users
} from "@/lib/db/schema";
import { PLAN_CAPS } from "@/lib/stripe/pricing";
import { resend, MAIL_FROM } from "@/lib/mail/client";

/**
 * Basic-Downgrade-Enforcement (Audit 2026-06-11 / Phase 2 / A7).
 *
 * Wird vom Stripe-Webhook aufgerufen, wenn ein Club auf den Basic-Plan
 * wechselt. Stellt die Basic-Caps wieder her:
 *
 * - >5 Sponsoren pro Team: die NEUESTEN Sponsoren (nach frühestem
 *   Pledge-createdAt) fliegen zuerst — alle ihre aktiven Pledges werden
 *   pausiert (status='paused' + pausedAt=now, damit bereits gespielte
 *   Spiele weiter abgerechnet werden, vgl. Phase-1-Semantik).
 * - >3 aktive Regeln pro verbleibendem Sponsor: die neuesten Regeln werden
 *   via effectiveUntil=now deaktiviert (Vergangenheit bleibt abrechenbar,
 *   H4-Versionierungs-Semantik).
 *
 * Deterministisch (Sortierung createdAt, Tiebreak id) und idempotent: der
 * zweite Webhook-Run findet keine aktiven Über-Cap-Bestände mehr.
 */
export async function enforceBasicDowngrade(
  clubId: string,
  now: Date = new Date()
): Promise<{ pausedPledges: number; deactivatedRules: number }> {
  const sponsorCap = PLAN_CAPS.basic.maxSponsorsPerTeam ?? Infinity;
  const ruleCap = PLAN_CAPS.basic.maxPledgeRulesPerSponsor ?? Infinity;

  const clubTeams = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.clubId, clubId));

  let pausedPledges = 0;
  let deactivatedRules = 0;

  // "Chargt noch": aktive Pledges UND Sommerpause-pausierte (Flag=true) —
  // letztere bedienen weiterhin Spiele in ihrem Fenster (Phase-1-Semantik).
  // Ein Downgrade im Juni muss auch sie deckeln (Review-Befund A7,
  // 2026-06-11), sonst laufen Über-Cap-Charges bis 30.6. weiter und der
  // Resume-Cron (1.8.) würde sie wieder aktivieren.
  const stillCharging = or(
    eq(pledges.status, "active"),
    and(eq(pledges.status, "paused"), eq(pledges.sommerpausePaused, true))
  );

  for (const team of clubTeams) {
    // Chargende Pledges des Teams, deterministisch sortiert (älteste zuerst).
    const activePledges = await db
      .select({
        id: pledges.id,
        sponsorId: pledges.sponsorId,
        createdAt: pledges.createdAt
      })
      .from(pledges)
      .where(and(eq(pledges.teamId, team.id), stillCharging))
      .orderBy(asc(pledges.createdAt), asc(pledges.id));

    // Sponsoren nach ihrem frühesten Pledge ordnen — die ältesten bleiben.
    const sponsorOrder: string[] = [];
    for (const p of activePledges) {
      if (!sponsorOrder.includes(p.sponsorId)) sponsorOrder.push(p.sponsorId);
    }

    const keptSponsors = sponsorOrder.slice(0, sponsorCap);
    const overCapSponsors = sponsorOrder.slice(sponsorCap);

    if (overCapSponsors.length > 0) {
      const pledgeIdsToPause = activePledges
        .filter((p) => overCapSponsors.includes(p.sponsorId))
        .map((p) => p.id);
      const paused = await db
        .update(pledges)
        .set({
          status: "paused",
          pausedAt: now,
          // Flag löschen: Enforcement-Pausen darf der 1.8.-Resume-Cron
          // NICHT wieder aufheben (der reaktiviert nur sommerpausePaused).
          sommerpausePaused: false
        })
        .where(
          and(
            inArray(pledges.id, pledgeIdsToPause),
            // Idempotenz-Guard: nur noch-chargende Pledges anfassen —
            // bereits enforcement-pausierte (Flag=false, pausedAt gesetzt)
            // matchen nicht erneut.
            stillCharging
          )
        )
        .returning({ id: pledges.id });
      pausedPledges += paused.length;
    }

    // Regel-Cap für die verbleibenden Sponsoren.
    for (const sponsorId of keptSponsors) {
      const rules = await db
        .select({ id: pledgeRules.id })
        .from(pledgeRules)
        .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
        .where(
          and(
            eq(pledges.teamId, team.id),
            eq(pledges.sponsorId, sponsorId),
            stillCharging,
            eq(pledgeRules.active, true),
            // Nur die aktuell gültige Regelversion zählt (H4-Semantik).
            isNull(pledgeRules.effectiveUntil)
          )
        )
        .orderBy(asc(pledgeRules.createdAt), asc(pledgeRules.id));

      const overCapRules = rules.slice(ruleCap).map((r) => r.id);
      if (overCapRules.length > 0) {
        const deactivated = await db
          .update(pledgeRules)
          .set({ effectiveUntil: now })
          .where(
            and(
              inArray(pledgeRules.id, overCapRules),
              isNull(pledgeRules.effectiveUntil)
            )
          )
          .returning({ id: pledgeRules.id });
        deactivatedRules += deactivated.length;
      }
    }
  }

  if (pausedPledges > 0 || deactivatedRules > 0) {
    await notifyClubAdmins(clubId, { pausedPledges, deactivatedRules, now });
  }

  return { pausedPledges, deactivatedRules };
}

async function notifyClubAdmins(
  clubId: string,
  info: { pausedPledges: number; deactivatedRules: number; now: Date }
): Promise<void> {
  const [club] = await db
    .select({ name: clubs.name, slug: clubs.slug })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);
  if (!club) return;

  const admins = await db
    .select({ email: users.email })
    .from(clubMemberships)
    .innerJoin(users, eq(clubMemberships.userId, users.id))
    .where(and(eq(clubMemberships.clubId, clubId), eq(clubMemberships.role, "admin")));
  const to = admins.map((a) => a.email).filter((e): e is string => !!e);
  if (to.length === 0) return;

  const lines = [
    `Hallo ${club.name},`,
    "",
    "euer KickPact-Plan wurde auf Basic umgestellt. Basic erlaubt bis zu 5 Sponsoren pro Mannschaft und 3 Regeln pro Sponsor — darüber liegende Pacts haben wir automatisch angepasst:",
    "",
    info.pausedPledges > 0
      ? `• ${info.pausedPledges} Pact(s) der zuletzt hinzugekommenen Sponsoren wurden pausiert.`
      : null,
    info.deactivatedRules > 0
      ? `• ${info.deactivatedRules} Regel(n) wurden deaktiviert (bereits gespielte Spiele bleiben abrechenbar).`
      : null,
    "",
    "Mit einem Upgrade auf Pro könnt ihr alle Pacts wieder aktivieren.",
    "",
    "Euer KickPact-Team"
  ].filter((l): l is string => l !== null);

  const send = await resend.emails.send({
    from: MAIL_FROM,
    to,
    subject: `Plan-Wechsel auf Basic: Sponsoren-Limits angewendet (${club.name})`,
    text: lines.join("\n"),
    headers: {
      "Idempotency-Key": `basic-downgrade-${clubId}-${info.now.toISOString().slice(0, 10)}`
    }
  });
  if (send.error) {
    // Mail-Fehler darf das Enforcement (DB-Teil) nicht zurückrollen — loggen reicht.
    console.error("[downgrade-enforcement] admin mail failed", send.error);
  }
}
