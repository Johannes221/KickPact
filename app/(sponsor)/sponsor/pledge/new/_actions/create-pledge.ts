"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pledges, pledgeRules, sponsors, teams } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import {
  pledgeInputSchema,
  normalizeTriggerParams,
  type PledgeInput
} from "@/lib/validations/pledge";
import { findInvitationByToken, markInvitationUsed } from "@/lib/db/queries/invitations";
import { getSubscriptionGate } from "@/lib/db/queries/subscription-status";
import {
  assertCanAddSponsorToTeam,
  PlanCapExceededError
} from "@/lib/billing/plan-features";
import {
  countPledgeRulesForSponsorOnTeam,
  getTeamLicensePlan
} from "@/lib/db/queries/pledges";
import { PLAN_CAPS } from "@/lib/stripe/pricing";
import {
  assertWagerWindowOpen,
  WagerWindowClosedError
} from "@/lib/billing/wager-window";
import { getActiveSeason } from "@/lib/billing/wager-window-server";
import { isSeasonTrigger } from "@/lib/db/schema/pledges";
import { SeasonWagerNotAllowedError } from "@/lib/billing/season-wager-errors";

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

  // Sponsor-Pledges brauchen eine teamId — die neue invitations-Tabelle hat
  // sie als nullable (für team-member Invites), aber sponsor-Invites haben sie
  // immer gesetzt. Defensive Narrowing damit der TS-Compiler glücklich ist.
  if (!invitation.teamId) {
    throw new Error("Einladung hat keine Mannschaft — falscher Token-Typ?");
  }
  const invitationTeamId: string = invitation.teamId;

  // Read-Only-Gate: Mannschaft → Club → Subscription. Wir lassen Sponsoren keinen
  // neuen Pledge anlegen, wenn der Verein im Read-Only-Modus ist.
  const [teamRow] = await db
    .select({ clubId: teams.clubId })
    .from(teams)
    .where(eq(teams.id, invitationTeamId))
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

  // Pricing v2: Cap-Check vor INSERT. Erst Sponsor-Cap (nur wenn neuer Sponsor),
  // dann Pledge-Rules-Cap (zählt bestehende Rules + die neu hinzukommenden).
  try {
    await assertCanAddSponsorToTeam(invitationTeamId, sponsorId);
    const plan = await getTeamLicensePlan(invitationTeamId);
    const ruleCap = PLAN_CAPS[plan].maxPledgeRulesPerSponsor;
    if (ruleCap !== null) {
      const existing = await countPledgeRulesForSponsorOnTeam(
        sponsorId,
        invitationTeamId
      );
      if (existing + parsed.rules.length > ruleCap) {
        throw new PlanCapExceededError(
          "pledge_rules",
          ruleCap,
          existing + parsed.rules.length,
          plan
        );
      }
    }
  } catch (e) {
    if (e instanceof PlanCapExceededError) {
      throw new Error(
        `Limit erreicht: ${e.cap === "sponsors" ? "max. Sponsoren" : "max. Pact-Regeln"} ` +
          `auf dem ${e.plan}-Tier (${e.current}/${e.limit}). Bitte Verein auf Pro upgraden.`
      );
    }
    throw e;
  }

  // Pricing v2: Saison-Wetten nur vor Matchday 5 erlaubt.
  const now = new Date();
  if (parsed.rules.some((r) => isSeasonTrigger(r.triggerType))) {
    // Pricing-v2-Audit #4 (2026-05-24): Tier-Gate fuer Saison-Wetten.
    // Laut docs/pricing.md §5+§8 ist season_* nur fuer Pro/Verein.
    // Auf basic-Tier ist es das Hauptverkaufsargument fuers Upgrade —
    // ohne Server-Gate koennten Basic-Sponsoren Saison-Wetten erstellen.
    const plan = await getTeamLicensePlan(invitationTeamId);
    if (plan === "basic") {
      throw new SeasonWagerNotAllowedError(plan);
    }

    const activeSeason = await getActiveSeason(now);
    try {
      assertWagerWindowOpen(activeSeason, now);
    } catch (e) {
      if (e instanceof WagerWindowClosedError) {
        throw new Error(
          `Saison-Wetten sind für Saison ${e.seasonCode ?? "?"} nicht mehr buchbar ` +
            `(Cutoff am 5. Spieltag). Wieder verfügbar zur nächsten Saison ab Juli.`
        );
      }
      throw e;
    }
  }

  // Saison-Ende vereinfacht: 30. Juni des Saison-Endjahrs
  const seasonEnd = (() => {
    const year = now.getMonth() <= 5 ? now.getFullYear() : now.getFullYear() + 1;
    return new Date(`${year}-06-30T23:59:59Z`);
  })();

  const result = await db.transaction(async (tx) => {
    const [pledge] = await tx
      .insert(pledges)
      .values({
        sponsorId: sponsorId,
        teamId: invitationTeamId,
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
        triggerParamsJson: normalizeTriggerParams(r.params),
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
