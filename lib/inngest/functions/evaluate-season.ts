import { and, eq, lte, gte, or, inArray, isNull } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/db/client";
import {
  charges,
  pledges,
  pledgeRules,
  teams,
  seasonResults,
  sponsors,
  users
} from "@/lib/db/schema";
import { isSeasonTrigger, type SeasonTriggerType } from "@/lib/db/schema/pledges";
import { cupRoundRank } from "@/lib/triggers/cup-rounds";
import { resend, MAIL_FROM } from "@/lib/mail/client";
import { getBaseUrl } from "@/lib/utils/base-url";
import { triggerLabel } from "@/lib/triggers/labels";
import { formatSaisonLabel } from "@/lib/utils/saison";

/**
 * Parsed eine saison-String wie "2526" oder "2025/26" in Datums-Grenzen.
 * Konvention: Saison startet 1.7. des unteren Jahres, endet 30.6. des oberen.
 * Exportiert für Unit-Tests.
 */
export function parseSeasonBoundaries(saison: string): { start: Date; end: Date } {
  const compact = saison.replace("/", "");
  let lo: number;
  let hi: number;
  if (compact.length === 4) {
    lo = 2000 + Number(compact.slice(0, 2));
    hi = 2000 + Number(compact.slice(2, 4));
  } else if (compact.length === 8) {
    lo = Number(compact.slice(0, 4));
    hi = Number(compact.slice(4, 8));
  } else {
    // Fallback: unbekanntes Format → epoch + far future, lässt alle Pledges durch
    return { start: new Date(0), end: new Date("9999-12-31") };
  }
  return {
    start: new Date(Date.UTC(lo, 6, 1, 0, 0, 0)), // 1.7. lo
    end: new Date(Date.UTC(hi, 5, 30, 23, 59, 59)) // 30.6. hi
  };
}

/**
 * Saison-Wetten-Auswertung: verarbeitet alle (zur Saison gültigen) Pledges der
 * Mannschaft mit Saison-Trigger-Regeln, vergleicht mit dem `season_results`-
 * Datensatz und erzeugt eine Charge pro erfolgreichem Trigger. Saison-Trigger
 * werden auto-confirmed (der Verein trägt das Ergebnis selbst ein) — es gibt
 * für sie KEINEN Sponsor-Approval-/Inbox-Pfad; nur ein expliziter Rule-Flag
 * `requiresApproval` erzwingt noch eine Bestätigung. Idempotent über
 * `charges.unique(pledge_rule_id, saison)`.
 */
export interface EvaluateSeasonResult {
  teamId: string;
  saison: string;
  chargesCreated: number;
  chargesSkipped: number;
  details: { ruleId: string; trigger: string; outcome: string }[];
  skipped?: string;
}

/**
 * Reine Auswertungs-Logik (ohne Inngest-`step`-Wrapper) — testbar gegen die
 * Test-DB über den globalen `db` (zeigt unter Vitest auf DATABASE_URL_TEST).
 * Idempotent über `charges.unique(pledge_rule_id, saison)`.
 */
export async function runEvaluateSeason(opts: {
  teamId: string;
  saison: string;
}): Promise<EvaluateSeasonResult> {
  const { teamId, saison } = opts;

  const [result] = await db
    .select()
    .from(seasonResults)
    .where(and(eq(seasonResults.teamId, teamId), eq(seasonResults.saison, saison)))
    .limit(1);
  if (!result) {
    return { teamId, saison, chargesCreated: 0, chargesSkipped: 0, details: [], skipped: "no-result" };
  }

  // Audit 2026-05-24 Task 2.6: Pledge muss zur Saison gültig gewesen sein —
  // vorher war `gte(pledges.endsAt, new Date(0))` tautologisch und Saison-
  // Wetten feuerten auch für Pledges, die erst NACH Saison-Ende erstellt
  // wurden (siehe cross-saison-pledges.test.ts:212-245).
  const { start: seasonStart, end: seasonEnd } = parseSeasonBoundaries(saison);
  const rows = await db
    .select({
      pledge: pledges,
      rule: pledgeRules,
      teamSaison: teams.saison
    })
    .from(pledgeRules)
    .innerJoin(pledges, eq(pledgeRules.pledgeId, pledges.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .where(
      and(
        eq(pledges.teamId, teamId),
        // FIX (Sommerpause-Charge-Lücke, Audit 2026-06-10): NICHT nur 'active'.
        // Der Sommerpause-Cron (1.6.) pausiert ALLE Pledges (status='paused',
        // sommerpause_paused=true), BEVOR der Verein das Saison-Ergebnis (Saison
        // endet 30.6.) einträgt. Mit reinem `status='active'` verloren diese
        // Pledges ihre End-of-Season-Charge dauerhaft. Sommerpause-pausierte
        // Pledges (Flag=true) wieder einbeziehen; die Gültigkeit ist ohnehin
        // über startsAt/endsAt gegen die Saison gegated.
        or(eq(pledges.status, "active"), eq(pledges.sommerpausePaused, true)),
        // Pledge musste zur Saison aktiv sein: startsAt <= Saison-Ende UND endsAt >= Saison-Start
        lte(pledges.startsAt, seasonEnd),
        gte(pledges.endsAt, seasonStart)
      )
    );

  let chargesCreated = 0;
  let chargesSkipped = 0;
  const details: { ruleId: string; trigger: string; outcome: string }[] = [];

  for (const r of rows) {
    if (!isSeasonTrigger(r.rule.triggerType)) continue;

    const triggerType = r.rule.triggerType as SeasonTriggerType;
    const params = (r.rule.triggerParamsJson ?? {}) as Record<string, unknown>;

    const hit = isTriggerHit(triggerType, params, result);
    if (!hit) {
      chargesSkipped += 1;
      details.push({ ruleId: r.rule.id, trigger: triggerType, outcome: "missed" });
      continue;
    }

    // FIX (cup_round-Dead-End, Audit 2026-06-10): season_cup_round wurde hier
    // zwangs-`pending_approval` gesetzt, aber für Saison-Trigger existierte
    // damals KEIN Approval-Pfad → auto-confirm (Verein trägt das Ergebnis
    // selbst ein, Tabellen-/Pokaldaten sind objektiv prüfbar).
    //
    // C2 (Audit 2026-06-11): season_custom ist die Ausnahme — das Custom-Ziel
    // ist eine reine VEREINS-Behauptung (customNotes), der Sponsor muss
    // bestätigen. Den Approval-Pfad gibt es jetzt: Bestätigung direkt auf der
    // Charge (lib/actions/season-charges.ts) + Sponsor-Inbox + 21d-Expiry im
    // expire-approvals-Cron.
    const requiresApproval =
      r.rule.requiresApproval || triggerType === "season_custom";

    const insertResult = await db
      .insert(charges)
      .values({
        pledgeId: r.pledge.id,
        pledgeRuleId: r.rule.id,
        matchId: null,
        saison,
        triggerType,
        amountCents: r.rule.amountCents,
        status: requiresApproval ? "pending_approval" : "confirmed",
        confirmedAt: requiresApproval ? null : new Date()
      })
      .onConflictDoNothing()
      .returning({ id: charges.id });

    if (insertResult.length > 0) {
      chargesCreated += 1;
      details.push({
        ruleId: r.rule.id,
        trigger: triggerType,
        outcome: requiresApproval ? "pending_approval" : "confirmed"
      });
    } else {
      details.push({ ruleId: r.rule.id, trigger: triggerType, outcome: "duplicate" });
    }
  }

  return { teamId, saison, chargesCreated, chargesSkipped, details };
}

/**
 * Saison-Wetten-Auswertung.
 *
 * Trigger: Event `season/result-set` mit `{teamId, saison}` payload.
 * Delegiert an {@link runEvaluateSeason}, gewrappt in einen Inngest-`step` für
 * Durability/Memoization. Idempotent über `charges.unique(pledge_rule_id, saison)`.
 */
export const evaluateSeason = inngest.createFunction(
  { id: "evaluate-season", name: "Evaluate Season-Wetten", concurrency: { limit: 2 } },
  [{ event: "season/result-set" }],
  async ({ event, step, logger }) => {
    const { teamId, saison } = event.data as { teamId: string; saison: string };
    const res = await step.run("evaluate-season", () =>
      runEvaluateSeason({ teamId, saison })
    );

    // C2 (Audit 2026-06-11): pending Saison-Charges (season_custom) brauchen
    // eine aktive Sponsor-Bestätigung — Mail mit Link auf die Inbox, sonst
    // läuft still der 21d-Expiry. Nur für in DIESEM Run erzeugte pendings.
    const pendingRuleIds = res.details
      .filter((d) => d.outcome === "pending_approval")
      .map((d) => d.ruleId);
    if (pendingRuleIds.length > 0) {
      const mailed = await step.run("notify-pending-sponsors", () =>
        notifyPendingSeasonCharges({ saison, ruleIds: pendingRuleIds })
      );
      logger.info("evaluate-season pending-mails", { mailed });
    }

    logger.info("evaluate-season done", {
      teamId,
      saison,
      chargesCreated: res.chargesCreated,
      chargesSkipped: res.chargesSkipped,
      skipped: res.skipped
    });
    return res;
  }
);

/**
 * Mailt Sponsoren über frisch erzeugte pending Saison-Charges (C2).
 * Eine Mail pro Sponsor, gebündelt über alle seine betroffenen Regeln.
 */
async function notifyPendingSeasonCharges(opts: {
  saison: string;
  ruleIds: string[];
}): Promise<number> {
  const rows = await db
    .select({
      chargeId: charges.id,
      amountCents: charges.amountCents,
      triggerType: charges.triggerType,
      sponsorEmail: users.email,
      sponsorName: sponsors.displayName,
      teamName: teams.name
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .innerJoin(users, eq(sponsors.userId, users.id))
    .where(
      and(
        inArray(charges.pledgeRuleId, opts.ruleIds),
        eq(charges.saison, opts.saison),
        eq(charges.status, "pending_approval"),
        isNull(charges.matchEventId)
      )
    );

  const bySponsor = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.sponsorEmail) continue;
    const list = bySponsor.get(row.sponsorEmail) ?? [];
    list.push(row);
    bySponsor.set(row.sponsorEmail, list);
  }

  const inboxUrl = `${getBaseUrl()}/sponsor/inbox`;
  let mailed = 0;
  for (const [email, items] of bySponsor) {
    const lines = items.map(
      (i) =>
        `• ${i.teamName}: ${triggerLabel(i.triggerType)} — ${(i.amountCents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}`
    );
    const send = await resend.emails.send({
      from: MAIL_FROM,
      to: email,
      subject: `Saison-Ziel erreicht? Bitte bestätigen (${formatSaisonLabel(opts.saison)})`,
      text: [
        `Hallo ${items[0].sponsorName},`,
        "",
        `der Verein hat für die ${formatSaisonLabel(opts.saison)} ein Saison-Ziel als erreicht gemeldet:`,
        "",
        ...lines,
        "",
        `Bitte bestätige oder lehne den Beitrag innerhalb von 21 Tagen ab: ${inboxUrl}`,
        "",
        "Euer KickPact-Team"
      ].join("\n"),
      headers: {
        "Idempotency-Key": `season-pending-${opts.saison}-${items
          .map((i) => i.chargeId)
          .sort()
          .join("-")}`
      }
    });
    if (send.error) {
      // Mail-Fehler nicht fatal — der Inbox-Eintrag + Badge bleiben sichtbar.
      console.error("[evaluate-season] pending-mail failed", send.error);
    } else {
      mailed += 1;
    }
  }
  return mailed;
}

/**
 * Prüft ob ein Saison-Trigger gemäß dem End-Ergebnis hit ist.
 * Exportiert für Unit-Tests.
 */
export function isTriggerHit(
  trigger: SeasonTriggerType,
  params: Record<string, unknown>,
  result: typeof seasonResults.$inferSelect
): boolean {
  switch (trigger) {
    case "season_promotion":
      return result.promoted === true;
    case "season_no_relegation":
      // Audit 2026-05-24 Task 2.6: nur als Hit zählen wenn das Resultat
      // wirklich ausgewertet wurde — sonst greift der Default `relegated=false`
      // und jeder Run mit unfertiger Saison erzeugt sofort Charges.
      if (!result.evaluatedAt) return false;
      return result.relegated === false;
    case "season_champion":
      return result.finalPosition === 1;
    case "season_table_position": {
      // Defensiv beide Schreibweisen lesen, falls eine Row noch nicht durch
      // Migration 0039 auf camelCase normalisiert wurde.
      const minPos = numberParam(params.minPosition ?? params.min_pos);
      const maxPos = numberParam(params.maxPosition ?? params.max_pos);
      if (minPos == null || maxPos == null || result.finalPosition == null) return false;
      return result.finalPosition >= minPos && result.finalPosition <= maxPos;
    }
    case "season_cup_round": {
      // Manuell: Sponsor bestätigt. Feuert, wenn die erreichte Runde >= der vom
      // Sponsor gewählten Ziel-Runde liegt. Defensiv beide Schreibweisen lesen,
      // falls eine Row noch nicht durch Migration 0039 normalisiert wurde.
      const minRound = (params.minRound ?? params.min_round) as string | undefined;
      const idxMin = cupRoundRank(minRound);
      const idxReached = cupRoundRank(result.cupRoundReached);
      if (idxMin < 0 || idxReached < 0) return false;
      return idxReached >= idxMin;
    }
    case "season_custom":
      // Custom — immer pending_approval erzeugen, der Sponsor entscheidet.
      // Hit-Logic: wenn Verein Custom-Notes eingetragen hat, gilt das als "behaupteter Hit".
      return Boolean(result.customNotes);
    default:
      return false;
  }
}

function numberParam(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
