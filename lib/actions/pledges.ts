"use server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { pledges, pledgeRules, sponsors } from "@/lib/db/schema";
import { isSeasonTrigger } from "@/lib/db/schema/pledges";
import { requireUser } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";
import { TRIGGER_TYPES, normalizeTriggerParams } from "@/lib/validations/pledge";
import { getTeamLicensePlan, countPledgeRulesForSponsorOnTeam } from "@/lib/db/queries/pledges";
import { getTeamDataCoverage } from "@/lib/db/queries/crawler";
import { coverageAllowsTrigger } from "@/lib/triggers/coverage";
import { getMonthlyChargedCents } from "@/lib/db/queries/evaluation";
import { PLAN_CAPS } from "@/lib/stripe/pricing";
import { assertWagerWindowOpen, WagerWindowClosedError } from "@/lib/billing/wager-window";
import { getActiveSeason } from "@/lib/billing/wager-window-server";

/**
 * Manuelle Trigger brauchen Sponsor-Bestätigung (charges = pending_approval).
 * Spiegelbild der Liste in create-pledge.ts.
 */
const MANUAL_TRIGGERS = new Set<string>([
  "special_goal",
  "yellow_card",
  "red_card",
  "assist",
  "man_of_match",
  "custom"
]);

type CapPeriod = "month" | "season";

/**
 * SECURITY (L5): Obergrenze pro Wett-Betrag (Cent) = 500 €, identisch zur
 * Zod-Decke im Pledge-Builder (lib/validations/pledge.ts: amountEur.max(500)).
 * Die Direkt-Object-Actions (updatePledgeRule/addPledgeRule) umgingen diese
 * Decke bislang — nur die Untergrenze (50 ct) war geprüft.
 */
const MAX_AMOUNT_CENTS = 50_000;

/** Helper: load pledge + tenant-check. Returns null when not found or wrong user. */
async function loadOwnedPledge(pledgeId: string) {
  const user = await requireUser();
  const [pledge] = await db
    .select({
      id: pledges.id,
      status: pledges.status,
      teamId: pledges.teamId,
      sponsorId: pledges.sponsorId,
      sponsorUserId: sponsors.userId
    })
    .from(pledges)
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .where(eq(pledges.id, pledgeId))
    .limit(1);
  if (!pledge || pledge.sponsorUserId !== user.id) return null;
  return pledge;
}

/** Helper: load a single rule + its pledge + tenant-check. */
async function loadOwnedRule(ruleId: string) {
  const user = await requireUser();
  const [row] = await db
    .select({
      ruleId: pledgeRules.id,
      pledgeId: pledges.id,
      pledgeStatus: pledges.status,
      active: pledgeRules.active,
      triggerType: pledgeRules.triggerType,
      amountCents: pledgeRules.amountCents,
      capCents: pledgeRules.capCents,
      capPeriod: pledgeRules.capPeriod,
      perMatchCapCents: pledgeRules.perMatchCapCents,
      triggerParamsJson: pledgeRules.triggerParamsJson,
      requiresApproval: pledgeRules.requiresApproval,
      sponsorUserId: sponsors.userId
    })
    .from(pledgeRules)
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .where(eq(pledgeRules.id, ruleId))
    .limit(1);
  if (!row || row.sponsorUserId !== user.id) return null;
  return row;
}

/** Validiert + normalisiert einen optionalen Perioden-Cap. */
function parseCap(
  isSeason: boolean,
  capCents: number | null | undefined,
  capPeriod: CapPeriod | undefined
): { ok: true; capCents: number | null; capPeriod: CapPeriod | null } | { ok: false; error: string } {
  // Kein/geleerter Cap → null/null.
  if (capCents === undefined || capCents === null) {
    return { ok: true, capCents: null, capPeriod: null };
  }
  if (isSeason) return { ok: false, error: "Saison-Regeln können keinen Cap haben." };
  if (!Number.isInteger(capCents) || capCents <= 0) {
    return { ok: false, error: "Cap muss ein positiver Betrag sein." };
  }
  if (capPeriod !== "month" && capPeriod !== "season") {
    return { ok: false, error: "Bitte Cap-Periode wählen (pro Monat oder pro Saison)." };
  }
  return { ok: true, capCents, capPeriod };
}

export async function setPledgeStatus(
  pledgeId: string,
  newStatus: "active" | "paused" | "ended"
): Promise<{ error?: string }> {
  try {
    const pledge = await loadOwnedPledge(pledgeId);
    if (!pledge) return { error: "Pledge nicht gefunden oder kein Zugriff." };

    if (pledge.status === "ended") {
      return { error: "Beendete Pledges können nicht mehr geändert werden." };
    }

    // When ending, also record endsAt = now so the timeline is accurate.
    if (newStatus === "ended") {
      await db
        .update(pledges)
        .set({ status: "ended", endsAt: new Date() })
        .where(eq(pledges.id, pledgeId));
    } else {
      await db
        .update(pledges)
        .set({ status: newStatus })
        .where(eq(pledges.id, pledgeId));
    }

    revalidatePath(`/sponsor/pledge/${pledgeId}`);
    revalidatePath("/sponsor");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Fehler" };
  }
}

/**
 * Update the monthly cap on an active or paused pledge.
 * Pass null to remove the cap entirely.
 * monthlyCapCents must be a positive integer (in Cent) when set.
 */
export async function updatePledgeCap(
  pledgeId: string,
  monthlyCapCents: number | null
): Promise<{ error?: string }> {
  try {
    const pledge = await loadOwnedPledge(pledgeId);
    if (!pledge) return { error: "Pledge nicht gefunden oder kein Zugriff." };
    if (pledge.status === "ended") {
      return { error: "Beendete Pledges können nicht mehr geändert werden." };
    }
    if (
      monthlyCapCents !== null &&
      (!Number.isInteger(monthlyCapCents) || monthlyCapCents <= 0)
    ) {
      return { error: "Cap muss ein positiver Betrag sein." };
    }

    // SECURITY (H4c): Den Monats-Cap NICHT unter den bereits in diesem Monat
    // aufgelaufenen Betrag senken können — sonst ließe sich nachträglich unter
    // schon abgerechnete Ereignisse "deckeln". (Das schmale Pre-Scrape-Fenster —
    // Cap senken nach Anpfiff, bevor der Scraper die Charges schreibt — bleibt
    // offen; volle Absicherung bräuchte Cap-Versionierung wie bei den Regeln.)
    if (monthlyCapCents !== null) {
      const accrued = await getMonthlyChargedCents(pledgeId, new Date());
      if (monthlyCapCents < accrued) {
        return {
          error: `Cap kann nicht unter den bereits abgerechneten Monatsbetrag (${(accrued / 100).toFixed(2)} €) gesenkt werden.`
        };
      }
    }

    await db.update(pledges).set({ monthlyCapCents }).where(eq(pledges.id, pledgeId));
    revalidatePath(`/sponsor/pledge/${pledgeId}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Fehler" };
  }
}

/**
 * Bearbeitet eine bestehende Wette (Betrag, Perioden-Cap, Parameter). Gilt nur
 * für KÜNFTIGE Spiele — bereits verbuchte Charges speichern ihren eigenen
 * Snapshot und bleiben unverändert.
 */
export async function updatePledgeRule(
  ruleId: string,
  input: {
    amountCents?: number;
    capCents?: number | null;
    capPeriod?: CapPeriod;
    params?: Record<string, unknown>;
  }
): Promise<{ error?: string }> {
  try {
    const rule = await loadOwnedRule(ruleId);
    if (!rule) return { error: "Regel nicht gefunden oder kein Zugriff." };
    if (rule.pledgeStatus === "ended") return { error: "Beendete Pacts können nicht geändert werden." };
    if (!rule.active) return { error: "Gelöschte Regeln können nicht geändert werden." };

    const patch: Partial<typeof pledgeRules.$inferInsert> = {};

    if (input.amountCents !== undefined) {
      if (!Number.isInteger(input.amountCents) || input.amountCents < 50) {
        return { error: "Betrag muss mindestens 0,50 € sein." };
      }
      if (input.amountCents > MAX_AMOUNT_CENTS) {
        return { error: "Betrag darf höchstens 500 € pro Ereignis sein." };
      }
      patch.amountCents = input.amountCents;
    }

    let capProvided = false;
    if (input.capCents !== undefined || input.capPeriod !== undefined) {
      const cap = parseCap(isSeasonTrigger(rule.triggerType), input.capCents, input.capPeriod);
      if (!cap.ok) return { error: cap.error };
      patch.capCents = cap.capCents;
      patch.capPeriod = cap.capPeriod;
      capProvided = true;
    }

    if (input.params !== undefined) {
      patch.triggerParamsJson = normalizeTriggerParams(input.params);
    }

    if (Object.keys(patch).length === 0) return {};

    // SECURITY (H4): Ist die Änderung eine REDUKTION (Betrag gesenkt, oder Cap
    // verschärft/neu hinzugefügt)? Dann nicht in-place mutieren — sonst würde
    // die Reduktion auch für bereits gespielte, aber noch nicht ausgewertete
    // Spiele greifen (Sponsor senkt nach Anpfiff, vor dem Scrape). Stattdessen
    // versionieren: alte Regel läuft bis JETZT (bedient vergangene Spiele zu
    // alten Konditionen), neue Regel gilt ab JETZT mit reduzierten Konditionen.
    const amountReduced =
      patch.amountCents !== undefined && patch.amountCents < rule.amountCents;
    const newCap = capProvided ? (patch.capCents ?? null) : rule.capCents;
    const capTightened =
      capProvided &&
      ((rule.capCents === null && newCap !== null) ||
        (rule.capCents !== null && newCap !== null && newCap < rule.capCents));
    const isReduction = amountReduced || capTightened;

    if (isReduction) {
      const now = new Date();
      await db.transaction(async (tx) => {
        // Alt-Version schließen (bleibt active für vergangene Spiele).
        await tx
          .update(pledgeRules)
          .set({ effectiveUntil: now })
          .where(eq(pledgeRules.id, ruleId));
        // Neue Version mit den finalen (reduzierten) Werten.
        await tx.insert(pledgeRules).values({
          pledgeId: rule.pledgeId,
          triggerType: rule.triggerType,
          triggerParamsJson:
            patch.triggerParamsJson ?? (rule.triggerParamsJson ?? {}),
          amountCents: patch.amountCents ?? rule.amountCents,
          perMatchCapCents: rule.perMatchCapCents,
          capCents: capProvided ? (patch.capCents ?? null) : rule.capCents,
          capPeriod: capProvided ? (patch.capPeriod ?? null) : rule.capPeriod,
          requiresApproval: rule.requiresApproval,
          active: true,
          effectiveFrom: now,
          effectiveUntil: null
        });
      });
    } else {
      await db.update(pledgeRules).set(patch).where(eq(pledgeRules.id, ruleId));
    }

    revalidatePath(`/sponsor/pledge/${rule.pledgeId}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Fehler" };
  }
}

/**
 * Löscht eine Wette per Soft-Delete (active=false). charges.pledge_rule_id ist
 * ON DELETE CASCADE → ein Hard-Delete würde Vergangenheits-Charges mitlöschen.
 * Künftige Spiele feuern nicht mehr; verbuchte Charges bleiben.
 */
export async function deletePledgeRule(ruleId: string): Promise<{ error?: string }> {
  try {
    const rule = await loadOwnedRule(ruleId);
    if (!rule) return { error: "Regel nicht gefunden oder kein Zugriff." };
    if (rule.pledgeStatus === "ended") return { error: "Beendete Pacts können nicht geändert werden." };
    if (!rule.active) return {};
    // SECURITY (H4b): `active=false` versteckt die Wette aus UI/Zählungen, und
    // `effectiveUntil=jetzt` sorgt dafür, dass der Evaluator sie noch für bereits
    // gespielte (aber noch nicht ausgewertete) Spiele in ihrem Fenster abrechnet —
    // künftige Spiele feuern nicht mehr. Ohne effectiveUntil würde ein Löschen
    // nach Anpfiff (vor dem Scrape) die legitime Charge unterdrücken.
    await db
      .update(pledgeRules)
      .set({ active: false, effectiveUntil: new Date() })
      .where(eq(pledgeRules.id, ruleId));
    revalidatePath(`/sponsor/pledge/${rule.pledgeId}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Fehler" };
  }
}

/**
 * Fügt einem bestehenden Pact eine neue Wette hinzu — mit Plan-Cap-Check und
 * (bei Saison-Triggern) Tier- + Wager-Window-Check, analog create-pledge.
 */
export async function addPledgeRule(
  pledgeId: string,
  input: {
    triggerType: string;
    amountCents: number;
    capCents?: number | null;
    capPeriod?: CapPeriod;
    params?: Record<string, unknown>;
  }
): Promise<{ error?: string }> {
  try {
    const pledge = await loadOwnedPledge(pledgeId);
    if (!pledge) return { error: "Pact nicht gefunden oder kein Zugriff." };
    if (pledge.status === "ended") return { error: "Beendete Pacts können nicht geändert werden." };

    if (!(TRIGGER_TYPES as readonly string[]).includes(input.triggerType)) {
      return { error: "Unbekannter Wett-Typ." };
    }

    // Daten-Coverage-Gate (analog create-pledge): Spieler-Wetten nur bei `full`,
    // `none`-Mannschaften gar nicht. Bestehende Regeln bleiben (updatePledgeRule
    // gatet bewusst nicht) — nur das NEU-Anlegen wird geblockt.
    const coverage = await getTeamDataCoverage(pledge.teamId);
    if (!coverageAllowsTrigger(coverage, input.triggerType)) {
      return {
        error:
          coverage === "none"
            ? "Für diese Mannschaft liegen auf fußball.de keine Spieldaten vor."
            : "Spieler-Regeln (Tor von Spieler, Hattrick) sind für diese Mannschaft nicht verfügbar – fußball.de liefert nur das Ergebnis, keine Torschützen."
      };
    }

    if (!Number.isInteger(input.amountCents) || input.amountCents < 50) {
      return { error: "Betrag muss mindestens 0,50 € sein." };
    }
    if (input.amountCents > MAX_AMOUNT_CENTS) {
      return { error: "Betrag darf höchstens 500 € pro Ereignis sein." };
    }

    const isSeason = isSeasonTrigger(input.triggerType);
    const cap = parseCap(isSeason, input.capCents, input.capPeriod);
    if (!cap.ok) return { error: cap.error };

    // Plan-Cap: max. Pact-Regeln pro Sponsor (zählt nur aktive Wetten).
    const plan = await getTeamLicensePlan(pledge.teamId);
    const ruleCap = PLAN_CAPS[plan].maxPledgeRulesPerSponsor;
    if (ruleCap !== null) {
      const existing = await countPledgeRulesForSponsorOnTeam(pledge.sponsorId, pledge.teamId);
      if (existing + 1 > ruleCap) {
        return { error: `Limit erreicht: max. ${ruleCap} Regeln auf dem ${plan}-Tier. Bitte Verein auf Pro upgraden.` };
      }
    }

    // Saison-Wetten: nur Pro/Verein + nur vor dem 5. Spieltag buchbar.
    if (isSeason) {
      if (plan === "basic") return { error: "Saison-Ziele sind erst ab dem Pro-Tier verfügbar." };
      const now = new Date();
      try {
        assertWagerWindowOpen(await getActiveSeason(now), now);
      } catch (e) {
        if (e instanceof WagerWindowClosedError) {
          return { error: "Saison-Ziele sind für diese Saison nicht mehr buchbar (Cutoff am 5. Spieltag)." };
        }
        throw e;
      }
    }

    await db.insert(pledgeRules).values({
      pledgeId,
      triggerType: input.triggerType as (typeof TRIGGER_TYPES)[number],
      triggerParamsJson: normalizeTriggerParams(input.params ?? {}),
      amountCents: input.amountCents,
      capCents: cap.capCents,
      capPeriod: cap.capPeriod,
      perMatchCapCents: null,
      requiresApproval: MANUAL_TRIGGERS.has(input.triggerType),
      active: true
    });
    revalidatePath(`/sponsor/pledge/${pledgeId}`);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Fehler" };
  }
}
