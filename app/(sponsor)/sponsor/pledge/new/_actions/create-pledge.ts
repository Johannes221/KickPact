"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pledges, pledgeRules, sponsors, teams } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { pledgeInputSchema, type PledgeInput } from "@/lib/validations/pledge";
import { findInvitationByToken, markInvitationUsed } from "@/lib/db/queries/invitations";
import { getSubscriptionGate } from "@/lib/db/queries/subscription-status";

const MANUAL_TRIGGERS = new Set([
  "special_goal",
  "yellow_card",
  "red_card",
  "assist",
  "man_of_match",
  "custom"
]);

export async function createPledge(input: PledgeInput) {
  const user = await requireUser();
  const parsed = pledgeInputSchema.parse(input);

  // Sponsor-Profil holen
  const [sponsor] = await db
    .select({ id: sponsors.id })
    .from(sponsors)
    .where(eq(sponsors.userId, user.id))
    .limit(1);
  let sponsorId: string;
  if (!sponsor) {
    const [created] = await db
      .insert(sponsors)
      .values({ userId: user.id, displayName: "", type: "familie" })
      .returning({ id: sponsors.id });
    sponsorId = created.id;
  } else {
    sponsorId = sponsor.id;
  }

  // Einladung auflösen → teamId
  const invitation = await findInvitationByToken(parsed.invitationToken);
  if (!invitation) {
    throw new Error("Einladung nicht gefunden oder abgelaufen.");
  }
  if (invitation.status === "revoked") {
    throw new Error("Einladung wurde vom Verein zurückgezogen.");
  }

  // Read-Only-Gate: Mannschaft → Club → Subscription. Wir lassen Sponsoren keinen
  // neuen Pledge anlegen, wenn der Verein im Read-Only-Modus ist.
  const [teamRow] = await db
    .select({ clubId: teams.clubId })
    .from(teams)
    .where(eq(teams.id, invitation.teamId))
    .limit(1);
  if (!teamRow) {
    throw new Error("Mannschaft zur Einladung nicht gefunden.");
  }
  const gate = await getSubscriptionGate(teamRow.clubId);
  if (gate.isReadOnly) {
    throw new Error(
      "Diese Mannschaft ist aktuell pausiert. Sponsoring ist wieder möglich, sobald das Abo reaktiviert wurde."
    );
  }

  // Saison-Ende vereinfacht: 30. Juni des Saison-Endjahrs
  const now = new Date();
  const seasonEnd = (() => {
    const year = now.getMonth() <= 5 ? now.getFullYear() : now.getFullYear() + 1;
    return new Date(`${year}-06-30T23:59:59Z`);
  })();

  const result = await db.transaction(async (tx) => {
    const [pledge] = await tx
      .insert(pledges)
      .values({
        sponsorId: sponsorId,
        teamId: invitation.teamId,
        status: "active",
        startsAt: now,
        endsAt: parsed.endsAtSaisonEnd
          ? seasonEnd
          : new Date(seasonEnd.getTime() + 365 * 24 * 60 * 60 * 1000),
        monthlyCapCents: parsed.monthlyCapEur
          ? Math.round(parsed.monthlyCapEur * 100)
          : null
      })
      .returning();

    await tx.insert(pledgeRules).values(
      parsed.rules.map((r) => ({
        pledgeId: pledge.id,
        triggerType: r.triggerType,
        triggerParamsJson: r.params,
        amountCents: Math.round(r.amountEur * 100),
        perMatchCapCents: r.perMatchCapEur
          ? Math.round(r.perMatchCapEur * 100)
          : null,
        requiresApproval: MANUAL_TRIGGERS.has(r.triggerType)
      }))
    );

    return { pledgeId: pledge.id };
  });

  await markInvitationUsed(parsed.invitationToken, user.id);

  return result;
}
