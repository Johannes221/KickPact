/**
 * W3 (Saison-Features 2026-06-12) — Kern der Geld-Simulation („Mit diesen
 * Regeln hättest du letzte Saison ca. X € beigetragen").
 *
 * PURE Funktion ohne DB-Zugriff: läuft die ECHTE Trigger-Engine
 * (`evaluateTriggers`) PRO Spiel über historische Matches und summiert die
 * Proposals. Kein ML, keine Heuristik — deterministisch, ehrlich, erklärbar.
 *
 * Cap-Nachbildung (bewusst VEREINFACHT gegenüber der DB-bewussten Logik in
 * evaluate-match/recalc, dokumentierte Abweichungen):
 * - Rule-Cap `capCents` + `capPeriod`:
 *     - `month`  → Budget pro KALENDERMONAT des Spieldatums.
 *     - `season` → ein Budget über die gesamte Simulation.
 *   Ein Proposal, das das Budget überschreiten würde, wird übersprungen
 *   (keine Teilbeträge — wie der Charge-basierte Skip downstream).
 * - Pledge-Monats-Cap `monthlyCapCents` — geteiltes Budget aller Regeln mit
 *   derselben `pledgeId` pro Kalendermonat des Spieldatums. Die Reihenfolge
 *   der Regeln (= Eingabe-Reihenfolge) entscheidet, wer zuerst vom Budget
 *   zehrt.
 * - Approval-Status wird ignoriert: simuliert wird „alles wäre bestätigt
 *   worden" (Rückblick, kein Versprechen).
 *
 * Saison-Regeln (`season_*`) feuern nicht pro Spiel — sie werden EXKLUDIERT
 * und im Result als `excludedSeasonRules` ausgewiesen („ohne Saison-Ziele").
 *
 * STABILES Interface: Builder-Panel (simulateDraftRules), Team-Dashboard-
 * Prognose und der Wrapped-Simulation-Slide (Agent C) bauen dagegen.
 */
import {
  evaluateTriggers,
  type MatchInput,
  type PledgeRuleInput,
  type TriggerType
} from "@/lib/crawler/triggers";
import { isSeasonTriggerType } from "@/lib/validations/pledge";

/** Engine-MatchInput + Spieldatum (bestimmt Monats-Buckets der Caps). */
export interface SimMatch extends MatchInput {
  datum: Date | string;
}

export interface SimRule {
  id: string;
  /**
   * Gruppiert Regeln zu einem Pact für `monthlyCapCents`.
   * Fehlend → alle Regeln ohne pledgeId teilen sich den Bucket "draft"
   * (Builder-Fall: EIN Entwurfs-Pact).
   */
  pledgeId?: string;
  triggerType: string;
  triggerParams?: Record<string, unknown>;
  amountCents: number;
  /** Perioden-Cap-Betrag (Cent), Fenster via `capPeriod` (Default month). */
  capCents?: number | null;
  capPeriod?: "month" | "season" | null;
  /** Monats-Cap (Cent) des zugehörigen Pacts — geteilt über alle Regeln des Pacts. */
  monthlyCapCents?: number | null;
}

export interface SimulationResult {
  totalCents: number;
  /** Aggregiert pro Trigger-Typ, absteigend nach Betrag. Nur Typen mit count > 0. */
  perRule: { triggerType: string; count: number; cents: number }[];
  /** Anzahl unterschiedlicher Kalendermonate der simulierten Spiele. */
  monthsCovered: number;
  matchCount: number;
  /** Trigger-Typen der ignorierten Saison-Regeln (Eingabe-Reihenfolge). */
  excludedSeasonRules: string[];
}

/** Kalendermonats-Schlüssel des Spieldatums, z.B. "2025-08". */
function monthKey(datum: Date): string {
  return `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, "0")}`;
}

export function simulateRulesOverMatches(
  matches: SimMatch[],
  rules: SimRule[]
): SimulationResult {
  const excludedSeasonRules = rules
    .filter((r) => isSeasonTriggerType(r.triggerType))
    .map((r) => r.triggerType);
  const matchRules = rules.filter((r) => !isSeasonTriggerType(r.triggerType));

  // Engine-Form der Regeln. Unbekannte Trigger-Typen liefern in der Engine
  // schlicht keine Proposals (default-Zweig) — kein Sonderfall nötig.
  const engineRules: PledgeRuleInput[] = matchRules.map((r) => ({
    id: r.id,
    pledgeId: r.pledgeId ?? "draft",
    triggerType: r.triggerType as TriggerType,
    triggerParams: r.triggerParams ?? {},
    amountCents: r.amountCents
  }));
  const ruleById = new Map(matchRules.map((r) => [r.id, r]));

  // Chronologisch simulieren — Caps verbrauchen sich in Spielreihenfolge.
  const ordered = [...matches]
    .map((m) => ({ m, datum: new Date(m.datum) }))
    .sort((a, b) => a.datum.getTime() - b.datum.getTime());

  /** Rule-Cap-Verbrauch: ruleId → (Bucket "season" | "YYYY-MM") → Cent. */
  const ruleSpent = new Map<string, Map<string, number>>();
  /** Pledge-Monats-Cap-Verbrauch: pledgeId → "YYYY-MM" → Cent. */
  const pledgeSpent = new Map<string, Map<string, number>>();
  const perType = new Map<string, { count: number; cents: number }>();
  const months = new Set<string>();
  let totalCents = 0;

  const bump = (map: Map<string, Map<string, number>>, key: string, bucket: string, cents: number) => {
    const inner = map.get(key) ?? new Map<string, number>();
    inner.set(bucket, (inner.get(bucket) ?? 0) + cents);
    map.set(key, inner);
  };
  const spent = (map: Map<string, Map<string, number>>, key: string, bucket: string) =>
    map.get(key)?.get(bucket) ?? 0;

  for (const { m, datum } of ordered) {
    const mk = monthKey(datum);
    months.add(mk);

    const proposals = evaluateTriggers(m, engineRules);
    for (const p of proposals) {
      const rule = ruleById.get(p.pledgeRuleId);
      if (!rule) continue;

      // Rule-Perioden-Cap (month default, wie der Builder ihn anlegt).
      if (rule.capCents != null) {
        const bucket = rule.capPeriod === "season" ? "season" : mk;
        if (spent(ruleSpent, rule.id, bucket) + p.amountCents > rule.capCents) continue;
      }

      // Pledge-Monats-Cap (geteilt über alle Regeln des Pacts).
      const pledgeKey = rule.pledgeId ?? "draft";
      if (rule.monthlyCapCents != null) {
        if (spent(pledgeSpent, pledgeKey, mk) + p.amountCents > rule.monthlyCapCents) {
          continue;
        }
      }

      // Akzeptiert — Budgets belasten + aggregieren.
      if (rule.capCents != null) {
        bump(ruleSpent, rule.id, rule.capPeriod === "season" ? "season" : mk, p.amountCents);
      }
      bump(pledgeSpent, pledgeKey, mk, p.amountCents);

      const agg = perType.get(p.triggerType) ?? { count: 0, cents: 0 };
      agg.count += 1;
      agg.cents += p.amountCents;
      perType.set(p.triggerType, agg);
      totalCents += p.amountCents;
    }
  }

  return {
    totalCents,
    perRule: [...perType.entries()]
      .map(([triggerType, v]) => ({ triggerType, ...v }))
      .sort((a, b) => b.cents - a.cents),
    monthsCovered: months.size,
    matchCount: matches.length,
    excludedSeasonRules
  };
}
