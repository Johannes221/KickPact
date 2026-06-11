"use server";

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
  getTeamLicensePlan,
  getClubIdForTeam,
  createPledgeWithRules
} from "@/lib/db/queries/pledges";
import { getTeamDataCoverage } from "@/lib/db/queries/crawler";
import { coverageAllowsTrigger } from "@/lib/triggers/coverage";
import {
  findSponsorForUser,
  createSponsorProfile
} from "@/lib/db/queries/sponsor-dashboard";
import { PLAN_CAPS } from "@/lib/stripe/pricing";
import {
  assertWagerWindowOpen,
  WagerWindowClosedError
} from "@/lib/billing/wager-window";
import { getActiveSeason } from "@/lib/billing/wager-window-server";
import { isSeasonTrigger } from "@/lib/db/schema/pledges";
import { SeasonWagerNotAllowedError } from "@/lib/billing/season-wager-errors";
import { deriveSponsorDisplayName } from "@/lib/db/queries/sponsor-label";
import { MANUAL_TRIGGERS } from "@/lib/triggers/manual-triggers";

/**
 * Ergebnis der Pledge-Erstellung. Fehler werden bewusst als `{ ok: false }`
 * zurückgegeben statt geworfen: Next.js *redacted* aus Server-Actions geworfene
 * Fehler in Production zur generischen „An error occurred in the Server
 * Components render"-Meldung — die echte (deutsche) Ursache ginge verloren.
 * Über den Rückgabewert erreicht die Klartext-Meldung den Client-Toast.
 */
export type CreatePledgeResult =
  | { ok: true; pledgeId: string }
  | { ok: false; message: string };

export async function createPledge(input: PledgeInput): Promise<CreatePledgeResult> {
  const user = await requireUser();
  // C1 (Audit 2026-06-11): safeParse statt parse — geworfene ZodErrors werden
  // von Next.js in Production redacted; über den Rückgabewert erreicht die
  // konkrete Validierungs-Meldung (z.B. fehlender Schwellwert) den Client.
  const parsedResult = pledgeInputSchema.safeParse(input);
  if (!parsedResult.success) {
    const first = parsedResult.error.issues[0];
    return {
      ok: false,
      message: first?.message ?? "Ungültige Pact-Daten — bitte Eingaben prüfen."
    };
  }
  const parsed = parsedResult.data;

  // Sponsor-Profil holen
  const sponsor = await findSponsorForUser(user.id);
  let sponsorId: string;
  if (!sponsor) {
    // display_name NIE leer anlegen — sonst ist der Sponsor zu seinem Pact
    // nicht identifizierbar. Default aus User-Name/E-Mail; im Sponsor-
    // Onboarding/Profil kann er ihn später überschreiben.
    const created = await createSponsorProfile({
      userId: user.id,
      displayName: deriveSponsorDisplayName(user),
      type: "familie"
    });
    sponsorId = created.id;
  } else {
    sponsorId = sponsor.id;
  }

  // Einladung auflösen → teamId
  const invitation = await findInvitationByToken(parsed.invitationToken);
  if (!invitation) {
    return { ok: false, message: "Einladung nicht gefunden oder abgelaufen." };
  }
  if (invitation.status === "revoked") {
    return { ok: false, message: "Einladung wurde vom Verein zurückgezogen." };
  }

  // Sponsor-Pledges brauchen eine teamId — die neue invitations-Tabelle hat
  // sie als nullable (für team-member Invites), aber sponsor-Invites haben sie
  // immer gesetzt. Defensive Narrowing damit der TS-Compiler glücklich ist.
  if (!invitation.teamId) {
    return { ok: false, message: "Einladung hat keine Mannschaft — falscher Token-Typ?" };
  }
  const invitationTeamId: string = invitation.teamId;

  // Read-Only-Gate: Mannschaft → Club → Subscription. Wir lassen Sponsoren keinen
  // neuen Pledge anlegen, wenn der Verein im Read-Only-Modus ist.
  const clubId = await getClubIdForTeam(invitationTeamId);
  if (!clubId) {
    return { ok: false, message: "Mannschaft zur Einladung nicht gefunden." };
  }

  const gate = await getSubscriptionGate(clubId);
  if (gate.isReadOnly) {
    return {
      ok: false,
      message:
        "Diese Mannschaft ist aktuell pausiert. Sponsoring ist wieder möglich, sobald das Abo reaktiviert wurde."
    };
  }

  // Daten-Coverage-Gate: fußball.de liefert für manche Mannschaften (C-/D-Jugend)
  // nur das Ergebnis ohne Torschützen, für andere (E-Jugend abwärts) gar keine
  // Daten. Spieler-Wetten (goal_by_player, hattrick) brauchen benannte Torschützen
  // → nur bei `full`. `none`-Mannschaften sind komplett nicht bespielbar. Server-
  // seitig autoritativ (der UI-Filter im Builder ist nur Komfort).
  // Siehe lib/triggers/coverage.ts + project_spielbericht_coverage.
  const teamCoverage = await getTeamDataCoverage(invitationTeamId);
  if (teamCoverage === "none") {
    return {
      ok: false,
      message:
        "Für diese Mannschaft liegen auf fußball.de keine Spieldaten vor – Sponsoring ist hier nicht möglich."
    };
  }
  const blockedRule = parsed.rules.find(
    (r) => !coverageAllowsTrigger(teamCoverage, r.triggerType)
  );
  if (blockedRule) {
    return {
      ok: false,
      message:
        "Spieler-Regeln (Tor von Spieler, Hattrick) sind für diese Mannschaft nicht verfügbar – " +
        "fußball.de liefert hier nur das Ergebnis, keine Torschützen."
    };
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
      return {
        ok: false,
        message:
          `Limit erreicht: ${e.cap === "sponsors" ? "max. Sponsoren" : "max. Pact-Regeln"} ` +
          `auf dem ${e.plan}-Tier (${e.current}/${e.limit}). Bitte Verein auf Pro upgraden.`
      };
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
      return { ok: false, message: new SeasonWagerNotAllowedError(plan).message };
    }

    const activeSeason = await getActiveSeason(now);
    try {
      assertWagerWindowOpen(activeSeason, now);
    } catch (e) {
      if (e instanceof WagerWindowClosedError) {
        return {
          ok: false,
          message:
            `Saison-Regeln sind für Saison ${e.seasonCode ?? "?"} nicht mehr buchbar ` +
            `(Cutoff am 5. Spieltag). Wieder verfügbar zur nächsten Saison ab Juli.`
        };
      }
      throw e;
    }
  }

  // Saison-Ende vereinfacht: 30. Juni des Saison-Endjahrs
  const seasonEnd = (() => {
    const year = now.getMonth() <= 5 ? now.getFullYear() : now.getFullYear() + 1;
    return new Date(`${year}-06-30T23:59:59Z`);
  })();

  const result = await createPledgeWithRules({
    pledge: {
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
    },
    rules: parsed.rules.map((r) => ({
      triggerType: r.triggerType,
      triggerParamsJson: normalizeTriggerParams(r.params),
      amountCents: Math.round(r.amountEur * 100),
      capCents: r.capEur ? Math.round(r.capEur * 100) : null,
      capPeriod: r.capEur ? (r.capPeriod ?? null) : null,
      perMatchCapCents: null,
      requiresApproval: MANUAL_TRIGGERS.has(r.triggerType)
    }))
  });

  await markInvitationUsed(parsed.invitationToken, user.id);

  return { ok: true, pledgeId: result.pledgeId };
}
