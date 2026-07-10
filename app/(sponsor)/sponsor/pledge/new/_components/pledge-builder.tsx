"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useFieldArray, type FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createId } from "@paralleldrive/cuid2";
import { Zap, Handshake, Trophy, ShieldCheck, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TriggerIcon } from "@/components/shared/trigger-icon";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  pledgeInputSchema,
  isSeasonTriggerType,
  type PledgeInput,
  type PledgeRuleInput,
  type TriggerType,
} from "@/lib/validations/pledge";
import { createPledge } from "../_actions/create-pledge";
import { SimulationPanel } from "./simulation-panel";
import { toast } from "sonner";
import { track } from "@/lib/analytics/track";
import { CUP_ROUND_ORDER, CUP_ROUND_LABELS } from "@/lib/triggers/cup-rounds";
import { RULE_SELECT_CLASS, RULE_FIELD_LABEL_CLASS } from "../../_components/rule-fields";
import { type Coverage, requiresNamedScorers } from "@/lib/triggers/coverage";

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * "auto"   = KickPact erfasst das Ereignis automatisch aus den offiziellen
 *            Spieldaten und verbucht es (Proof of Trust).
 * "club"   = Der Verein meldet das Ereignis; KickPact kann es nicht automatisch
 *            prüfen → du bestätigst es (Glocke/E-Mail), bevor es zählt.
 * "season" = 1× am Saison-Ende.
 */
type TriggerGroup = "auto" | "club" | "season";

type LibItem = {
  /** Stabile, eindeutige Auswahl-ID. Bei Spezialtoren `special_goal:<subtype>`. */
  key: string;
  type: TriggerType;
  /** Nur bei Spezialtoren gesetzt — landet in triggerParamsJson.subtype. */
  subtype?: string;
  label: string;
  emoji: string;
  description: string;
  defaultEur: number;
  group: TriggerGroup;
};

const TRIGGER_LIBRARY: LibItem[] = [
  // ── Automatisch von KickPact erfasst (pro Spiel) ──
  { key: "goal_total", type: "goal_total", label: "Pro Tor", emoji: "⚽", description: "Für jedes Tor der eigenen Mannschaft", defaultEur: 5, group: "auto" },
  { key: "win", type: "win", label: "Pro Sieg", emoji: "🏆", description: "Einmal pro gewonnenem Spiel", defaultEur: 10, group: "auto" },
  { key: "home_win", type: "home_win", label: "Pro Heimsieg", emoji: "🏠", description: "Einmal pro Sieg vor eigenem Publikum", defaultEur: 10, group: "auto" },
  { key: "away_win", type: "away_win", label: "Pro Auswärtssieg", emoji: "🚌", description: "Auswärtssiege kannst du höher bewerten 💪", defaultEur: 15, group: "auto" },
  { key: "clean_sheet", type: "clean_sheet", label: "Pro Zu-Null-Sieg", emoji: "🛡️", description: "Gewonnen + 0 Gegentore", defaultEur: 5, group: "auto" },
  { key: "comeback_win", type: "comeback_win", label: "Pro Comeback-Sieg", emoji: "🔥", description: "Irgendwann hinten gelegen, am Ende gewonnen", defaultEur: 20, group: "auto" },
  { key: "hattrick", type: "hattrick", label: "Pro Hattrick", emoji: "🎯", description: "1 Spieler ≥3 Tore in einem Spiel", defaultEur: 25, group: "auto" },
  { key: "goal_by_player", type: "goal_by_player", label: "Tore von Spieler X", emoji: "💎", description: "Wähle deinen Lieblings-Spieler", defaultEur: 3, group: "auto" },
  { key: "goals_scored_min", type: "goals_scored_min", label: "Mind. X Tore", emoji: "🎉", description: "z.B. ab 5 Toren pro Spiel", defaultEur: 30, group: "auto" },
  { key: "goal_diff_min", type: "goal_diff_min", label: "Hoher Sieg (Diff ≥X)", emoji: "💪", description: "z.B. Tordifferenz ≥3", defaultEur: 15, group: "auto" },

  // ── Vom Verein gemeldet (Spezialwetten — du bestätigst) ──
  { key: "special_goal:kopfball", type: "special_goal", subtype: "kopfball", label: "Kopfballtor", emoji: "🤕", description: "Tor per Kopf", defaultEur: 10, group: "club" },
  { key: "special_goal:hackentor", type: "special_goal", subtype: "hackentor", label: "Hackentor", emoji: "🦶", description: "Tor mit der Hacke", defaultEur: 15, group: "club" },
  { key: "special_goal:elfmeter", type: "special_goal", subtype: "elfmeter", label: "Elfmetertor", emoji: "🎯", description: "Verwandelter Elfmeter", defaultEur: 8, group: "club" },
  { key: "special_goal:freistoss", type: "special_goal", subtype: "freistoss", label: "Freistoßtor (direkt)", emoji: "🎯", description: "Direkt verwandelter Freistoß", defaultEur: 12, group: "club" },
  { key: "special_goal:eckentor", type: "special_goal", subtype: "eckentor", label: "Eckentor (direkt)", emoji: "🚩", description: "Direkt verwandelter Eckstoß", defaultEur: 20, group: "club" },
  { key: "special_goal:tor_mittellinie", type: "special_goal", subtype: "tor_mittellinie", label: "Tor hinter Mittellinie", emoji: "🎯", description: "Tor aus der eigenen Hälfte", defaultEur: 25, group: "club" },
  { key: "special_goal:sonstiges", type: "special_goal", subtype: "sonstiges", label: "Sonstiges Spezialtor", emoji: "🎭", description: "Anderes besonderes Tor — Verein beschreibt es im Kommentar", defaultEur: 10, group: "club" },
  // assist/man_of_match bewusst NICHT wählbar: die Melde-UI des Vereins bietet
  // sie nicht an und `validateSubtype` lehnt sie serverseitig ab (B3-Audit
  // 2026-06-11) — ein solcher Pact könnte nie feuern und würde dem Sponsor eine
  // Geld-Prognose vorgaukeln, die immer 0 € bleibt.
  { key: "yellow_card", type: "yellow_card", label: "Gelbe Karte", emoji: "🟨", description: "Für die Mannschaftskasse 😉", defaultEur: 2, group: "club" },
  { key: "red_card", type: "red_card", label: "Rote Karte", emoji: "🟥", description: "Für die Mannschaftskasse 😉", defaultEur: 5, group: "club" },

  // ── Pro Saison ──
  { key: "season_promotion", type: "season_promotion", label: "Aufstieg", emoji: "⬆️", description: "1× wenn die Mannschaft aufsteigt", defaultEur: 200, group: "season" },
  { key: "season_no_relegation", type: "season_no_relegation", label: "Klassenerhalt", emoji: "🛟", description: "1× wenn nicht abgestiegen", defaultEur: 100, group: "season" },
  { key: "season_champion", type: "season_champion", label: "Meister-Titel", emoji: "👑", description: "1× wenn Tabellenplatz 1 am Saison-Ende", defaultEur: 300, group: "season" },
  { key: "season_table_position", type: "season_table_position", label: "Endplatz im Bereich", emoji: "🥇", description: "z.B. Platz 1–5 (Range)", defaultEur: 75, group: "season" },
  { key: "season_cup_round", type: "season_cup_round", label: "Pokal-Runde", emoji: "🏆", description: "z.B. Halbfinale erreicht — Verein meldet, du bestätigst", defaultEur: 150, group: "season" },
  { key: "season_custom", type: "season_custom", label: "Eigenes Saison-Ziel", emoji: "🎺", description: "Verein meldet, du bestätigst", defaultEur: 50, group: "season" },
];

/** Eindeutige Auswahl-ID einer Regel (matcht LibItem.key). */
function ruleKey(triggerType: string, params: Record<string, unknown> | undefined): string {
  if (triggerType === "special_goal") {
    return `special_goal:${(params?.subtype as string) ?? ""}`;
  }
  return triggerType;
}

function defForRule(rule: { triggerType: string; params?: Record<string, unknown> }): LibItem | undefined {
  return TRIGGER_LIBRARY.find((l) => l.key === ruleKey(rule.triggerType, rule.params));
}

type WizardStep = 1 | 2 | 3 | 4;

// ─── Main Component ───────────────────────────────────────────────────────────

export function PledgeBuilder({
  dataCoverage = null,
  seasonWindowOpen = true,
}: {
  /**
   * Daten-Coverage der Mannschaft (siehe lib/triggers/coverage.ts). Bei nicht-
   * `full` werden Spieler-Wetten (goal_by_player, hattrick) ausgeblendet, weil
   * fußball.de dort keine Torschützen liefert. NULL = unklassifiziert → alles.
   * Das Server-Gate in createPledge ist die harte Linie; dies ist Komfort.
   */
  dataCoverage?: Coverage | null;
  /**
   * A7: Saison-Trigger-Window (Cutoff 5. Spieltag). Bei geschlossenem Fenster
   * werden die Saison-Karten in Step 2 disabled — der Server-Check in
   * createPledge bleibt die harte Linie.
   */
  seasonWindowOpen?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const invitationToken = params.get("invitation");
  // Idempotenz-Key EINMAL pro Wizard-Session (Mount). Ein Doppelklick auf
  // „Sponsoring starten" schickt denselben Key → createPledge legt nur EINEN
  // Pledge an (partieller Unique-Index). Bewusst NICHT pro Submit neu, sonst
  // greift der Doppel-Submit-Schutz nicht.
  const [idempotencyKey] = useState(() => createId());

  // Spieler-Wetten nur bei `full`-Coverage (oder unklassifiziertem Bestand).
  const playerBetsAllowed = dataCoverage === "full" || dataCoverage == null;
  const visibleLibrary = playerBetsAllowed
    ? TRIGGER_LIBRARY
    : TRIGGER_LIBRARY.filter((t) => !requiresNamedScorers(t.type));
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<WizardStep>(1);
  const [enabled, setEnabled] = useState<Set<string>>(new Set(["goal_total", "win"]));
  const [squadPlayers, setSquadPlayers] = useState<string[]>([]);
  const [squadLoading, setSquadLoading] = useState(false);

  const form = useForm<PledgeInput>({
    resolver: zodResolver(pledgeInputSchema),
    defaultValues: {
      invitationToken: invitationToken ?? "",
      idempotencyKey,
      rules: [
        { triggerType: "goal_total", amountEur: 5, params: {} },
        { triggerType: "win", amountEur: 10, params: {} },
      ],
      monthlyCapEur: undefined,
      endsAtSaisonEnd: true,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "rules",
  });

  // Spielerliste sofort beim Mount vorladen (sobald der Token da ist), nicht
  // erst lazy bei Step 3 — die /api/squad-Quelle ist jetzt DB-only (Kader ∪
  // alle Auftritte) und schnell, also ist die Liste fertig, bevor der Sponsor
  // „Tore von Spieler X" überhaupt aufklappt. Skeleton bleibt nur als Fallback.
  useEffect(() => {
    if (!invitationToken) return;
    setSquadLoading(true);
    fetch(`/api/squad?invitationToken=${encodeURIComponent(invitationToken)}`)
      .then((r) => r.json())
      .then((data: { players?: string[] }) => {
        if (data.players) setSquadPlayers(data.players);
      })
      .catch(() => {
        // ignore — player name falls back to text input
      })
      .finally(() => setSquadLoading(false));
  }, [invitationToken]);

  function toggleTrigger(item: LibItem) {
    const next = new Set(enabled);
    if (next.has(item.key)) {
      next.delete(item.key);
      const idx = fields.findIndex((f) => ruleKey(f.triggerType, f.params) === item.key);
      if (idx >= 0) remove(idx);
    } else {
      next.add(item.key);
      append({
        triggerType: item.type,
        amountEur: item.defaultEur,
        params: item.subtype ? { subtype: item.subtype } : {},
      });
    }
    setEnabled(next);
  }

  function onSubmit(values: PledgeInput) {
    if (values.rules.length === 0) {
      toast.error("Mindestens ein Ereignis auswählen");
      return;
    }
    startTransition(async () => {
      try {
        const result = await createPledge(values);
        if (!result.ok) {
          // Klartext-Grund aus der Server-Action (Cap, Coverage, pausiert …).
          toast.error(result.message);
          return;
        }
        track("pledge_created", {
          triggerCount: values.rules.length,
          monthlyCap: values.monthlyCapEur ?? 0,
          endsAtSaisonEnd: values.endsAtSaisonEnd ?? false
        });
        toast.success("Sponsoring ist live 🎉");
        router.push(`/sponsor/pledge/${result.pledgeId}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler beim Speichern");
      }
    });
  }

  /**
   * A2 (Audit 2026-06-11): Stiller Submit-Fail in Step 4. Validierungsfehler
   * hängen oft an Feldern, deren Step gerade nicht gerendert ist (z.B. fehlender
   * Spieler in Step 3) — `handleSubmit` tat dann sichtbar nichts. Der
   * onInvalid-Handler zeigt den ersten konkreten Fehler als Toast und springt
   * automatisch zum Step des fehlerhaften Felds.
   */
  function onInvalid(errors: FieldErrors<PledgeInput>) {
    // 1) Fehler an einer konkreten Regel → Step 3 (Beträge/Parameter).
    const rules = form.getValues("rules");
    const ruleFields = ["amountEur", "capEur", "capPeriod", "params"] as const;
    for (let i = 0; i < rules.length; i++) {
      for (const key of ruleFields) {
        const { error } = form.getFieldState(`rules.${i}.${key}`);
        if (error?.message) {
          const def = defForRule(rules[i]);
          toast.error(def ? `${def.label}: ${error.message}` : error.message);
          setStep(3);
          return;
        }
      }
    }
    // 2) Root-Fehler am rules-Array (keine Regel gewählt) → Step 2 (Auswahl).
    if (errors.rules) {
      const rootMessage = errors.rules.message ?? errors.rules.root?.message;
      toast.error(rootMessage ?? "Bitte wähle mindestens ein Ereignis aus.");
      setStep(2);
      return;
    }
    // 3) Step-4-Felder (Monats-Cap etc.) → bleiben/zurück auf Step 4.
    if (errors.monthlyCapEur?.message) {
      toast.error(errors.monthlyCapEur.message);
      setStep(4);
      return;
    }
    if (errors.invitationToken?.message) {
      toast.error(errors.invitationToken.message);
      return;
    }
    toast.error("Bitte prüfe deine Eingaben.");
  }

  const watchedRules = form.watch("rules");
  const watchedMonthly = form.watch("monthlyCapEur");
  const worstCasePerSaison = estimateWorstCase(watchedRules);
  const worstCasePerMonth = Math.round(worstCasePerSaison / 9);

  if (!invitationToken) {
    return (
      <div className="rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-4 text-sm text-brand-alert-red">
        Kein Einladungs-Token. Bitte über den Vereins-Einladungslink kommen.
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-8">
        <StepIndicator currentStep={step} />

        {/* ── Step 1: Erklärung ── */}
        {step === 1 && (
          <section className="space-y-6">
            <div>
              <h2 className="font-display font-bold text-xl md:text-2xl tracking-tight text-brand-night-navy">
                So funktioniert dein Sponsoring
              </h2>
              <p className="mt-1 text-sm text-brand-night-navy/60">
                Kurz, wie's läuft — danach wählst du die Ereignisse und legst die Beträge fest.
              </p>
            </div>

            <HowItWorks />

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="accent"
                size="lg"
                onClick={() => setStep(2)}
                className="min-h-12 w-full sm:w-auto"
              >
                Los geht's →
              </Button>
            </div>
          </section>
        )}

        {/* ── Step 2: Ereignisse wählen ── */}
        {step === 2 && (
          <section className="space-y-6">
            <div>
              <h2 className="font-display font-bold text-xl md:text-2xl tracking-tight text-brand-night-navy">
                Welche Ereignisse sollen zählen?
              </h2>
              <p className="mt-1 text-sm text-brand-night-navy/60">
                Wähle beliebig viele aus — im nächsten Schritt legst du die Beträge und Caps fest.
              </p>
            </div>

            {!playerBetsAllowed && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                Für diese Mannschaft liefert die offizielle Datenquelle nur das{" "}
                <strong>Spielergebnis</strong>, keine einzelnen Torschützen.
                Spieler-Regeln („Tore von Spieler X", „Hattrick") sind daher hier
                nicht verfügbar — Ergebnis-, Comeback- und Saison-Regeln kannst du
                ganz normal anlegen.
              </div>
            )}

            <TriggerGroupBlock
              title="Automatisch erfasst"
              icon={<Zap className="h-4 w-4" />}
              note="KickPact zieht diese Ereignisse automatisch aus den offiziellen Spieldaten — nichts zu melden, alles nachweisbar verbucht."
              items={visibleLibrary.filter((t) => t.group === "auto")}
              enabled={enabled}
              onToggle={toggleTrigger}
            />

            <TriggerGroupBlock
              title="Vom Verein gemeldet"
              icon={<Handshake className="h-4 w-4" />}
              note="Diese Ereignisse kann KickPact nicht automatisch prüfen. Der Verein meldet sie — du bestätigst sie, bevor ein Beitrag fällig wird."
              items={visibleLibrary.filter((t) => t.group === "club")}
              enabled={enabled}
              onToggle={toggleTrigger}
              tone="club"
            />

            <TriggerGroupBlock
              title="Pro Saison"
              icon={<Trophy className="h-4 w-4" />}
              note={
                seasonWindowOpen
                  ? "Feuern 1× am Saison-Ende."
                  : "Saison-Ziele sind bis zum 5. Spieltag buchbar — wieder ab Saisonstart-Fenster."
              }
              items={visibleLibrary.filter((t) => t.group === "season")}
              enabled={enabled}
              onToggle={toggleTrigger}
              disabled={!seasonWindowOpen}
            />

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                className="min-h-12 w-full sm:w-auto"
              >
                ← Erklärung
              </Button>
              <Button
                type="button"
                variant="accent"
                size="lg"
                disabled={enabled.size === 0}
                onClick={() => setStep(3)}
                className="min-h-12 w-full sm:w-auto"
              >
                Weiter: Beträge festlegen →
              </Button>
            </div>
          </section>
        )}

        {/* ── Step 3: Beträge festlegen ── */}
        {step === 3 && (
          <section className="space-y-6">
            <div>
              <h2 className="font-display font-bold text-xl md:text-2xl tracking-tight text-brand-night-navy">
                Wie viel pro Ereignis?
              </h2>
              <p className="mt-1 text-sm text-brand-night-navy/60">
                Leg fest, was jedes Ereignis wert ist. Optional: ein Cap pro Regel —
                begrenzt die Auszahlung pro Monat oder pro Saison (sinnvoll bei torreichen Teams).
              </p>
            </div>

            <div className="space-y-3">
              {fields.map((field, index) => {
                const def = defForRule(field);
                const isSeason = isSeasonTriggerType(field.triggerType);
                return (
                  <div
                    key={field.id}
                    className="rounded-xl bg-white shadow-ios-card p-4 space-y-3"
                  >
                    {/* Kopf: Ereignis + Beschreibung */}
                    <div className="flex items-start gap-2">
                      {def && (
                        <TriggerIcon
                          type={def.type}
                          className="h-4 w-4 mt-0.5 shrink-0 text-accent-dark"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-semibold text-brand-night-navy">
                          {def?.label}
                          {def?.group === "club" && (
                            <span className="inline-flex items-center text-[0.55rem] uppercase tracking-widest font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                              Verein meldet
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-brand-night-navy/50 mt-0.5 leading-snug">
                          {def?.description}
                        </div>
                      </div>
                    </div>

                    {/* Felder: einheitliches Raster, alle Controls gleich hoch (50px) */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 items-start">
                      <FormField
                        control={form.control}
                        name={`rules.${index}.amountEur`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className={RULE_FIELD_LABEL_CLASS}>Betrag (€)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.5"
                                min="0.5"
                                {...field}
                                onChange={(e) => field.onChange(Number(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Perioden-Cap nur für wiederkehrende Spiel-Wetten — Saison-Wetten
                          feuern 1× und brauchen keinen Cap. */}
                      {!isSeason && (
                        <>
                          <FormField
                            control={form.control}
                            name={`rules.${index}.capEur`}
                            render={({ field: cf }) => (
                              <FormItem>
                                <FormLabel className={RULE_FIELD_LABEL_CLASS}>Cap (€)</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    step="1"
                                    min="0"
                                    placeholder="optional"
                                    value={cf.value ?? ""}
                                    onChange={(e) => {
                                      const v = e.target.value === "" ? undefined : Number(e.target.value);
                                      cf.onChange(v);
                                      if (
                                        v !== undefined &&
                                        form.getValues(`rules.${index}.capPeriod`) === undefined
                                      ) {
                                        form.setValue(`rules.${index}.capPeriod`, "month");
                                      }
                                    }}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`rules.${index}.capPeriod`}
                            render={({ field: pf }) => (
                              <FormItem>
                                <FormLabel className={RULE_FIELD_LABEL_CLASS}>pro</FormLabel>
                                <FormControl>
                                  <select
                                    className={RULE_SELECT_CLASS}
                                    value={pf.value ?? "month"}
                                    disabled={form.watch(`rules.${index}.capEur`) === undefined}
                                    onChange={(e) => pf.onChange(e.target.value as "month" | "season")}
                                  >
                                    <option value="month">Monat</option>
                                    <option value="season">Saison</option>
                                  </select>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </>
                      )}

                      {field.triggerType === "goal_by_player" && (
                        <FormField
                          control={form.control}
                          name={`rules.${index}.params`}
                          render={({ field: pf }) => (
                            <FormItem className="col-span-2">
                              <FormLabel className={RULE_FIELD_LABEL_CLASS}>Spieler</FormLabel>
                              <FormControl>
                                {squadLoading ? (
                                  <div className="h-[50px] rounded-xl border border-ios-separator-opaque bg-brand-off-white animate-pulse" />
                                ) : squadPlayers.length > 0 ? (
                                  <select
                                    className={RULE_SELECT_CLASS}
                                    value={(pf.value as Record<string, string>)?.player_name ?? ""}
                                    onChange={(e) =>
                                      pf.onChange({
                                        ...((pf.value as Record<string, unknown>) ?? {}),
                                        player_name: e.target.value,
                                      })
                                    }
                                  >
                                    <option value="">Spieler wählen…</option>
                                    {squadPlayers.map((name) => (
                                      <option key={name} value={name}>
                                        {name}
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <div className="space-y-2.5">
                                    {/* Leerer Pool: meist, weil der Verein den
                                        Kader auf fussball.de nicht öffentlich
                                        freigegeben hat (Default). Hinweis +
                                        Mini-Anleitung statt nur leeres Feld. */}
                                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm leading-snug text-amber-900">
                                      <p className="font-semibold">
                                        Noch keine Spielerliste verfügbar
                                      </p>
                                      <p className="mt-1 text-amber-900/80">
                                        Für Spieler-Pacts brauchen wir den Kader von der offiziellen Datenquelle — diese
                                        Mannschaft hat ihn dort noch nicht öffentlich freigegeben.
                                      </p>
                                      <p className="mt-2 text-amber-900/80">
                                        <strong>So gibt der Verein ihn frei:</strong> auf fussball.de einloggen → Mannschaft
                                        → Reiter „Kader" → „Kader veröffentlichen". Nach dem nächsten Datenabgleich (meist
                                        am Folgetag) erscheinen die Spieler hier automatisch.
                                      </p>
                                    </div>
                                    <div>
                                      <Input
                                        placeholder="Oder Namen manuell eingeben, z.B. Schmidt"
                                        value={(pf.value as Record<string, string>)?.player_name ?? ""}
                                        onChange={(e) =>
                                          pf.onChange({
                                            ...((pf.value as Record<string, unknown>) ?? {}),
                                            player_name: e.target.value,
                                          })
                                        }
                                      />
                                      <p className="mt-1 text-[0.7rem] text-brand-night-navy/50">
                                        Ein manuell eingegebener Name zählt, sobald genau dieser Spieler trifft.
                                      </p>
                                    </div>
                                  </div>
                                )}
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      )}

                      {field.triggerType === "goals_scored_min" && (
                        <FormField
                          control={form.control}
                          name={`rules.${index}.params`}
                          render={({ field: pf }) => (
                            <FormItem>
                              <FormLabel className={RULE_FIELD_LABEL_CLASS}>Min. Tore</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="2"
                                  max="20"
                                  placeholder="5"
                                  value={(pf.value as Record<string, number>)?.min_goals ?? ""}
                                  onChange={(e) =>
                                    pf.onChange({
                                      ...((pf.value as Record<string, unknown>) ?? {}),
                                      min_goals: Number(e.target.value),
                                    })
                                  }
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      )}

                      {field.triggerType === "goal_diff_min" && (
                        <FormField
                          control={form.control}
                          name={`rules.${index}.params`}
                          render={({ field: pf }) => (
                            <FormItem>
                              <FormLabel className={RULE_FIELD_LABEL_CLASS}>Min. Tordiff.</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="2"
                                  max="20"
                                  placeholder="3"
                                  value={(pf.value as Record<string, number>)?.min_diff ?? ""}
                                  onChange={(e) =>
                                    pf.onChange({
                                      ...((pf.value as Record<string, unknown>) ?? {}),
                                      min_diff: Number(e.target.value),
                                    })
                                  }
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      )}

                      {field.triggerType === "season_table_position" && (
                        <>
                          <FormField
                            control={form.control}
                            name={`rules.${index}.params`}
                            render={({ field: pf }) => (
                              <FormItem>
                                <FormLabel className={RULE_FIELD_LABEL_CLASS}>Platz von</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min="1"
                                    max="30"
                                    placeholder="1"
                                    value={(pf.value as Record<string, number>)?.min_pos ?? ""}
                                    onChange={(e) =>
                                      pf.onChange({
                                        ...((pf.value as Record<string, unknown>) ?? {}),
                                        min_pos: Number(e.target.value),
                                      })
                                    }
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name={`rules.${index}.params`}
                            render={({ field: pf }) => (
                              <FormItem>
                                <FormLabel className={RULE_FIELD_LABEL_CLASS}>bis Platz</FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min="1"
                                    max="30"
                                    placeholder="5"
                                    value={(pf.value as Record<string, number>)?.max_pos ?? ""}
                                    onChange={(e) =>
                                      pf.onChange({
                                        ...((pf.value as Record<string, unknown>) ?? {}),
                                        max_pos: Number(e.target.value),
                                      })
                                    }
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </>
                      )}

                      {field.triggerType === "season_cup_round" && (
                        <FormField
                          control={form.control}
                          name={`rules.${index}.params`}
                          render={({ field: pf }) => (
                            <FormItem className="col-span-2">
                              <FormLabel className={RULE_FIELD_LABEL_CLASS}>Mindestens erreichte Runde</FormLabel>
                              <FormControl>
                                <select
                                  className={RULE_SELECT_CLASS}
                                  value={(pf.value as Record<string, string>)?.min_round ?? ""}
                                  onChange={(e) =>
                                    pf.onChange({
                                      ...((pf.value as Record<string, unknown>) ?? {}),
                                      min_round: e.target.value,
                                    })
                                  }
                                >
                                  <option value="">Runde wählen…</option>
                                  {CUP_ROUND_ORDER.map((r) => (
                                    <option key={r} value={r}>
                                      {CUP_ROUND_LABELS[r]}
                                    </option>
                                  ))}
                                </select>
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(2)}
                className="min-h-12 w-full sm:w-auto"
              >
                ← Ereignisse ändern
              </Button>
              <Button
                type="button"
                variant="accent"
                size="lg"
                onClick={() => setStep(4)}
                className="min-h-12 w-full sm:w-auto"
              >
                Weiter: Zusammenfassung →
              </Button>
            </div>
          </section>
        )}

        {/* ── Step 4: Zusammenfassung & aktivieren ── */}
        {step === 4 && (
          <section className="space-y-6">
            <div>
              <h2 className="font-display font-bold text-xl md:text-2xl tracking-tight text-brand-night-navy">
                Alles klar?
              </h2>
              <p className="mt-1 text-sm text-brand-night-navy/60">
                Lege deinen Monats-Cap fest und aktiviere dein Sponsoring.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <FormField
                control={form.control}
                name="monthlyCapEur"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-semibold text-brand-night-navy">
                      Monats-Cap (empfohlen)
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="5"
                        min="0"
                        placeholder="z.B. 50"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                        }
                      />
                    </FormControl>
                    <p className="text-xs text-brand-night-navy/60">
                      Egal wie geil die Mannschaft drauf ist — du zahlst nie mehr pro Monat.
                    </p>
                    {!watchedMonthly && (
                      <p className="text-xs text-brand-alert-red mt-1">
                        ⚠️ Kein Cap = unbegrenzt. Empfehlung: Cap setzen.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endsAtSaisonEnd"
                render={({ field }) => (
                  <FormItem className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <FormLabel className="text-sm font-semibold text-brand-night-navy">
                          Pact endet zur Saison
                        </FormLabel>
                        <p className="text-xs text-brand-night-navy/60 mt-1">
                          Empfohlen — kein „läuft weiter ohne mich"-Effekt.
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                        className="h-5 w-5 mt-1 shrink-0 accent-current text-accent"
                      />
                    </div>
                  </FormItem>
                )}
              />
            </div>

            <Card className="border-accent/40 bg-accent/5">
              <CardHeader>
                <CardTitle className="font-display font-bold text-lg tracking-tight text-brand-night-navy">
                  💰 Worst-Case-Hochrechnung
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
                      Pro Saison
                    </div>
                    <div className="mt-1 font-display font-bold text-3xl tracking-tight text-accent">
                      {watchedMonthly
                        ? `≤ ${Math.min(worstCasePerSaison, watchedMonthly * 9)} €`
                        : `≈ ${worstCasePerSaison} €`}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
                      Pro Monat (geschätzt)
                    </div>
                    <div className="mt-1 font-display font-bold text-3xl tracking-tight text-brand-night-navy">
                      {watchedMonthly ? `≤ ${watchedMonthly} €` : `≈ ${worstCasePerMonth} €`}
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-xs text-brand-night-navy/60">
                  Annahme: 18 Saison-Spiele, ⌀ 2 Tore, 50% Sieg-Quote. Konservative Hochrechnung.
                </p>

                <div className="mt-4 border-t border-accent/20 pt-4">
                  <div className="text-xs font-semibold uppercase tracking-widest text-brand-night-navy/50 mb-2">
                    Deine Ereignisse
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {watchedRules.map((r, i) => {
                      const def = defForRule(r);
                      return (
                        <span
                          key={`${ruleKey(r.triggerType, r.params)}-${i}`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-white border border-accent/30 px-2.5 py-1 text-xs font-medium text-brand-night-navy"
                        >
                          {def && <TriggerIcon type={def.type} className="h-3.5 w-3.5 shrink-0 text-accent-dark" />}
                          {def?.label ?? r.triggerType} — {r.amountEur} €
                        </span>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* W3: „Das hätte letzte Saison X € gebracht" — echte Spiele statt
                Daumen-Schätzung. Mountet erst mit Step 4 → genau 1 Berechnung
                pro Step-Eintritt; ohne Vorsaison-Daten unsichtbar. */}
            <SimulationPanel
              invitationToken={invitationToken}
              rules={watchedRules}
              monthlyCapEur={watchedMonthly}
              dataCoverage={dataCoverage}
            />

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(3)}
                className="min-h-12 w-full sm:w-auto"
              >
                ← Beträge anpassen
              </Button>
              <Button
                type="submit"
                variant="accent"
                size="lg"
                disabled={pending || fields.length === 0}
                className="min-h-12 w-full sm:w-auto sm:flex-none"
              >
                {pending ? "Speichere…" : "Sponsoring aktivieren →"}
              </Button>
            </div>
          </section>
        )}
      </form>
    </Form>
  );
}

// ─── "So funktioniert's"-Erklärung ─────────────────────────────────────────────

function HowItWorks() {
  return (
    <div className="rounded-2xl bg-brand-off-white p-4 md:p-5 space-y-3">
      <div className="text-xs font-bold uppercase tracking-widest text-brand-night-navy/50">
        So funktioniert dein Sponsoring
      </div>
      <ul className="space-y-2.5">
        <li className="flex gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/10 text-accent-dark">
            <Zap className="h-4 w-4" aria-hidden />
          </span>
          <p className="text-sm text-brand-night-navy/80 leading-snug">
            <strong className="text-brand-night-navy">Automatisch erfasst:</strong> Tore, Siege &
            Saison-Ziele zieht KickPact selbst aus den offiziellen Spieldaten, verwaltet sie und
            verbucht jeden Beitrag nachvollziehbar — du musst nichts melden.
          </p>
        </li>
        <li className="flex gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
            <Handshake className="h-4 w-4" aria-hidden />
          </span>
          <p className="text-sm text-brand-night-navy/80 leading-snug">
            <strong className="text-brand-night-navy">Vom Verein gemeldet (Spezial-Events):</strong>{" "}
            Dinge wie Kopfball- oder Hackentore kann KickPact nicht automatisch prüfen. Der Verein
            meldet sie — und <strong className="text-brand-night-navy">du bestätigst sie</strong>,
            bevor ein Beitrag fällig wird.
          </p>
        </li>
        <li className="flex gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/10 text-accent-dark">
            <Gauge className="h-4 w-4" aria-hidden />
          </span>
          <p className="text-sm text-brand-night-navy/80 leading-snug">
            <strong className="text-brand-night-navy">Caps schützen dich:</strong> Pro Regel und
            zusätzlich pro Monat/Saison kannst du ein Limit setzen — so zahlst du nie mehr, als du
            möchtest, egal wie gut die Mannschaft läuft.
          </p>
        </li>
      </ul>
    </div>
  );
}

// ─── Trigger-Gruppe ─────────────────────────────────────────────────────────────

function TriggerGroupBlock({
  title,
  icon,
  note,
  items,
  enabled,
  onToggle,
  tone = "default",
  disabled = false,
}: {
  title: string;
  icon: React.ReactNode;
  note: string;
  items: LibItem[];
  enabled: Set<string>;
  onToggle: (item: LibItem) => void;
  tone?: "default" | "club";
  /** A7: ganze Gruppe nicht wählbar (z.B. Saison-Window geschlossen). */
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={tone === "club" ? "text-amber-700" : "text-accent-dark"}>{icon}</span>
        <h4
          className={
            "text-xs uppercase tracking-widest font-bold " +
            (tone === "club" ? "text-amber-700" : "text-accent-dark")
          }
        >
          {title}
        </h4>
      </div>
      <p
        className={
          "text-xs mb-3 leading-snug max-w-2xl " +
          (disabled ? "text-amber-700 font-medium" : "text-brand-night-navy/50")
        }
      >
        {note}
      </p>
      <div className="grid gap-2.5 md:gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <TriggerToggle
            key={item.key}
            item={item}
            enabled={enabled.has(item.key)}
            onToggle={() => onToggle(item)}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const steps = [
    { n: 1 as WizardStep, label: "Erklärung" },
    { n: 2 as WizardStep, label: "Ereignisse" },
    { n: 3 as WizardStep, label: "Beträge" },
    { n: 4 as WizardStep, label: "Aktivieren" },
  ];

  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className="flex items-center gap-2">
            <div
              className={
                "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 " +
                (s.n === currentStep
                  ? "bg-accent text-white"
                  : s.n < currentStep
                  ? "bg-emerald-500 text-white"
                  : "bg-brand-neutral/30 text-brand-night-navy/40")
              }
            >
              {s.n < currentStep ? "✓" : s.n}
            </div>
            <span
              className={
                "text-sm font-semibold hidden sm:block " +
                (s.n === currentStep ? "text-brand-night-navy" : "text-brand-night-navy/40")
              }
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={
                "w-8 md:w-12 h-0.5 mx-2 " +
                (s.n < currentStep ? "bg-emerald-400" : "bg-brand-neutral/30")
              }
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Trigger Toggle ───────────────────────────────────────────────────────────

function TriggerToggle({
  item,
  enabled,
  onToggle,
  disabled = false,
}: {
  item: LibItem;
  enabled: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={enabled}
      disabled={disabled}
      className={
        "text-left rounded-xl border p-3 transition-colors " +
        (disabled
          ? "border-brand-neutral/30 bg-brand-off-white opacity-50 cursor-not-allowed"
          : enabled
          ? "border-accent bg-accent/5"
          : "border-brand-neutral/40 bg-white hover:border-accent/40")
      }
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent-dark">
          <TriggerIcon type={item.type} className="h-[1.15rem] w-[1.15rem]" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-brand-night-navy">{item.label}</div>
          <div className="text-xs text-brand-night-navy/60 mt-0.5 leading-snug">{item.description}</div>
          {item.group === "club" && (
            <div className="mt-1 inline-flex items-center text-[0.6rem] uppercase tracking-widest font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
              Verein meldet · du bestätigst
            </div>
          )}
        </div>
        <div
          className={
            "h-5 w-5 rounded border-2 shrink-0 flex items-center justify-center " +
            (enabled ? "bg-accent border-accent" : "bg-white border-brand-neutral")
          }
        >
          {enabled && (
            <svg viewBox="0 0 20 20" fill="white" className="h-3 w-3">
              <path
                fillRule="evenodd"
                d="M16.704 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.296-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Worst Case Helper ────────────────────────────────────────────────────────

function estimateWorstCase(
  rules: { triggerType: string; amountEur: number; capEur?: number }[]
): number {
  const SAISON_GAMES = 18;
  const AVG_GOALS_PER_GAME = 2;
  const WIN_RATE = 0.5;
  const COMEBACK_RATE = 0.1;
  const CLEAN_SHEET_RATE = 0.15;
  const HATTRICK_RATE = 0.05;
  const SPECIAL_GOAL_PER_GAME = 0.3;
  const HIGH_DIFF_RATE = 0.1;
  const FIVE_PLUS_GOALS_RATE = 0.1;
  const YELLOW_PER_GAME = 1.5;
  const RED_PER_GAME = 0.1;

  return Math.round(
    rules.reduce((total, r) => {
      const cap = r.capEur ?? r.amountEur * 99;
      switch (r.triggerType) {
        case "goal_total":
        case "goal_by_player":
          return total + Math.min(r.amountEur * AVG_GOALS_PER_GAME, cap) * SAISON_GAMES;
        case "win":
          return total + r.amountEur * SAISON_GAMES * WIN_RATE;
        case "home_win":
        case "away_win":
          // Halbe Saison Heim-, halbe Auswärtsspiele.
          return total + r.amountEur * (SAISON_GAMES / 2) * WIN_RATE;
        case "clean_sheet":
          return total + r.amountEur * SAISON_GAMES * CLEAN_SHEET_RATE;
        case "comeback_win":
          return total + r.amountEur * SAISON_GAMES * COMEBACK_RATE;
        case "hattrick":
          return total + r.amountEur * SAISON_GAMES * HATTRICK_RATE;
        case "special_goal":
          return total + r.amountEur * SAISON_GAMES * SPECIAL_GOAL_PER_GAME;
        case "goal_diff_min":
          return total + r.amountEur * SAISON_GAMES * HIGH_DIFF_RATE;
        case "goals_scored_min":
          return total + r.amountEur * SAISON_GAMES * FIVE_PLUS_GOALS_RATE;
        case "yellow_card":
          return total + Math.min(r.amountEur * YELLOW_PER_GAME, cap) * SAISON_GAMES;
        case "red_card":
          return total + r.amountEur * SAISON_GAMES * RED_PER_GAME;
        default:
          return total + r.amountEur;
      }
    }, 0)
  );
}
