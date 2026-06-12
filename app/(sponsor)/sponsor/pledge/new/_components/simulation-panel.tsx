"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { triggerLabel } from "@/lib/triggers/labels";
import { eur } from "@/lib/utils/currency";
import type { Coverage } from "@/lib/triggers/coverage";
import {
  simulateDraftRules,
  type SimulateDraftInput,
  type SimulateDraftResult
} from "../_actions/simulate-draft";

/**
 * W3 (Saison-Features 2026-06-12) — „Rückblick"-Karte in Step 4 des Builders.
 *
 * Simuliert die aktuell konfigurierten Regeln über die ECHTEN Spiele der
 * Vorsaison (Server Action `simulateDraftRules`, gleiche Gates wie
 * createPledge). Wird beim STEP-4-EINTRITT einmal berechnet (Komponente
 * mountet erst dann) — nicht bei jedem Keystroke. Ohne Vorsaison-Spiele oder
 * bei Fehlern verschwindet die Karte still.
 */
export function SimulationPanel({
  invitationToken,
  rules,
  monthlyCapEur,
  dataCoverage
}: {
  invitationToken: string;
  rules: SimulateDraftInput["rules"];
  monthlyCapEur?: number;
  dataCoverage?: Coverage | null;
}) {
  const [data, setData] = useState<SimulateDraftResult | null>(null);
  const [loading, setLoading] = useState(true);
  // StrictMode-Doppel-Mount-Guard — die Action soll pro Step-4-Eintritt 1× laufen.
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    simulateDraftRules({ invitationToken, rules, monthlyCapEur })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
    // Bewusst nur beim Mount (= Step-4-Eintritt) — siehe Komponenten-Doku.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="h-24 rounded-xl border border-brand-neutral/30 bg-brand-off-white animate-pulse" />
    );
  }

  // Kein Panel ohne Daten: Action-Fehler oder 0 Vorsaison-Spiele.
  if (!data || !data.ok || data.result.matchCount === 0) return null;

  const { result, prevSaisonLabel } = data;
  const topRules = result.perRule.slice(0, 3);
  const limitedCoverage = dataCoverage === "results_only" || dataCoverage === "none";

  return (
    <Card className="border-brand-night-navy/15 bg-brand-off-white">
      <CardHeader>
        <CardTitle className="font-display font-bold text-lg tracking-tight text-brand-night-navy">
          💡 Rückblick: Saison {prevSaisonLabel}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-brand-night-navy/80">
          Mit diesen Regeln hättest du letzte Saison über{" "}
          {result.matchCount} Spiele ca.{" "}
          <strong className="font-display text-xl text-brand-night-navy">
            {eur(result.totalCents)}
          </strong>{" "}
          beigetragen.
        </p>

        {topRules.length > 0 && (
          <ul className="mt-3 space-y-1">
            {topRules.map((r) => (
              <li
                key={r.triggerType}
                className="flex items-baseline justify-between gap-3 text-sm text-brand-night-navy/70"
              >
                <span>
                  {r.count}× {triggerLabel(r.triggerType)}
                </span>
                <span className="font-semibold text-brand-night-navy">{eur(r.cents)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 space-y-1 border-t border-brand-neutral/30 pt-3">
          {limitedCoverage && (
            <p className="text-xs text-brand-night-navy/60">
              Basiert auf den Endständen — Spieler-Ereignisse meldet der Verein.
            </p>
          )}
          {result.excludedSeasonRules.length > 0 && (
            <p className="text-xs text-brand-night-navy/60">
              Saison-Ziele zählen 1× am Saison-Ende und sind im Rückblick nicht enthalten.
            </p>
          )}
          <p className="text-xs text-brand-night-navy/50">
            Rückblick auf echte Spiele der Vorsaison — kein Versprechen für die neue Saison.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
