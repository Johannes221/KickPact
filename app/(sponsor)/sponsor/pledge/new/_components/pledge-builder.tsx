"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TriggerIcon } from "@/components/shared/trigger-icon";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  pledgeInputSchema,
  isSeasonTriggerType,
  type PledgeInput,
  type TriggerType,
} from "@/lib/validations/pledge";
import { createPledge } from "../_actions/create-pledge";
import { toast } from "sonner";
import { track } from "@/lib/analytics/track";
import { CUP_ROUND_ORDER, CUP_ROUND_LABELS } from "@/lib/triggers/cup-rounds";

// ─── Types ────────────────────────────────────────────────────────────────────

type TriggerDef = {
  type: TriggerType;
  label: string;
  emoji: string;
  description: string;
  defaultEur: number;
  manual?: boolean;
};

type TriggerCategory = "match" | "season";

const TRIGGER_LIBRARY: (TriggerDef & { category: TriggerCategory })[] = [
  { category: "match", type: "goal_total", label: "Pro Tor", emoji: "⚽", description: "Für jedes Tor der eigenen Mannschaft", defaultEur: 5 },
  { category: "match", type: "win", label: "Pro Sieg", emoji: "🏆", description: "Einmal pro gewonnenem Spiel", defaultEur: 10 },
  { category: "match", type: "clean_sheet", label: "Pro Zu-Null-Sieg", emoji: "🛡️", description: "Gewonnen + 0 Gegentore", defaultEur: 5 },
  { category: "match", type: "comeback_win", label: "Pro Comeback-Sieg", emoji: "🔥", description: "Halbzeit hinten, am Ende vorne", defaultEur: 20 },
  { category: "match", type: "hattrick", label: "Pro Hattrick", emoji: "🎯", description: "1 Spieler ≥3 Tore in einem Spiel", defaultEur: 25 },
  { category: "match", type: "goal_by_player", label: "Tore von Spieler X", emoji: "💎", description: "Wähle deinen Lieblings-Spieler", defaultEur: 3 },
  { category: "match", type: "special_goal", label: "Spezial-Tor", emoji: "🎭", description: "Kopfball, Hackentor, Elfmeter — Verein meldet, du bestätigst", defaultEur: 10, manual: true },
  { category: "match", type: "goals_scored_min", label: "Mind. X Tore", emoji: "🎉", description: "z.B. ab 5 Toren pro Spiel", defaultEur: 30 },
  { category: "match", type: "goal_diff_min", label: "Hoher Sieg (Diff ≥X)", emoji: "💪", description: "z.B. Tordifferenz ≥3", defaultEur: 15 },
  { category: "season", type: "season_promotion", label: "Aufstieg", emoji: "⬆️", description: "1× wenn die Mannschaft aufsteigt", defaultEur: 200 },
  { category: "season", type: "season_no_relegation", label: "Klassenerhalt", emoji: "🛟", description: "1× wenn nicht abgestiegen", defaultEur: 100 },
  { category: "season", type: "season_champion", label: "Meister-Titel", emoji: "👑", description: "1× wenn Tabellenplatz 1 am Saison-Ende", defaultEur: 300 },
  { category: "season", type: "season_table_position", label: "Endplatz im Bereich", emoji: "🥇", description: "z.B. Platz 1–5 (Range)", defaultEur: 75 },
  { category: "season", type: "season_cup_round", label: "Pokal-Runde", emoji: "🏆", description: "z.B. Halbfinale erreicht — Verein meldet, du bestätigst", defaultEur: 150, manual: true },
  { category: "season", type: "season_custom", label: "Eigenes Saison-Ziel", emoji: "🎺", description: "Verein meldet, du bestätigst", defaultEur: 50, manual: true },
];

type WizardStep = 1 | 2 | 3;

// ─── Main Component ───────────────────────────────────────────────────────────

export function PledgeBuilder() {
  const router = useRouter();
  const params = useSearchParams();
  const invitationToken = params.get("invitation");
  const [pending, startTransition] = useTransition();
  const [step, setStep] = useState<WizardStep>(1);
  const [enabled, setEnabled] = useState<Set<TriggerType>>(new Set(["goal_total", "win"]));
  const [squadPlayers, setSquadPlayers] = useState<string[]>([]);
  const [squadLoading, setSquadLoading] = useState(false);

  const form = useForm<PledgeInput>({
    resolver: zodResolver(pledgeInputSchema),
    defaultValues: {
      invitationToken: invitationToken ?? "",
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

  // Load squad when step 2 is reached and goal_by_player is selected
  useEffect(() => {
    if (
      step === 2 &&
      enabled.has("goal_by_player") &&
      squadPlayers.length === 0 &&
      invitationToken
    ) {
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
    }
  }, [step, enabled, invitationToken, squadPlayers.length]);

  function toggleTrigger(type: TriggerType) {
    const next = new Set(enabled);
    if (next.has(type)) {
      next.delete(type);
      const idx = fields.findIndex((f) => f.triggerType === type);
      if (idx >= 0) remove(idx);
    } else {
      next.add(type);
      const def = TRIGGER_LIBRARY.find((t) => t.type === type)!;
      append({ triggerType: type, amountEur: def.defaultEur, params: {} });
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
        const { pledgeId } = await createPledge(values);
        track("pledge_created", {
          triggerCount: values.rules.length,
          monthlyCap: values.monthlyCapEur ?? 0,
          endsAtSaisonEnd: values.endsAtSaisonEnd ?? false
        });
        toast.success("Sponsoring ist live 🎉");
        router.push(`/sponsor/pledge/${pledgeId}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler beim Speichern");
      }
    });
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <StepIndicator currentStep={step} />

        {/* ── Step 1: Ereignisse wählen ── */}
        {step === 1 && (
          <section className="space-y-6">
            <div>
              <h2 className="font-display font-bold text-xl md:text-2xl tracking-tight text-brand-night-navy">
                Welche Ereignisse sollen zählen?
              </h2>
              <p className="mt-1 text-sm text-brand-night-navy/60">
                Wähle beliebig viele aus — im nächsten Schritt legst du die Beträge fest.
              </p>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-widest font-bold text-accent-dark mb-3">
                ⚽ Pro Spiel
              </h4>
              <div className="grid gap-2.5 md:gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {TRIGGER_LIBRARY.filter((t) => t.category === "match").map((t) => (
                  <TriggerToggle
                    key={t.type}
                    def={t}
                    enabled={enabled.has(t.type)}
                    onToggle={() => toggleTrigger(t.type)}
                  />
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs uppercase tracking-widest font-bold text-accent-dark mb-3">
                🏆 Pro Saison{" "}
                <span className="ml-1 text-brand-night-navy/40 font-normal normal-case tracking-normal">
                  — 1× am Saison-Ende
                </span>
              </h4>
              <div className="grid gap-2.5 md:gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {TRIGGER_LIBRARY.filter((t) => t.category === "season").map((t) => (
                  <TriggerToggle
                    key={t.type}
                    def={t}
                    enabled={enabled.has(t.type)}
                    onToggle={() => toggleTrigger(t.type)}
                  />
                ))}
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="accent"
                size="lg"
                disabled={enabled.size === 0}
                onClick={() => setStep(2)}
                className="min-h-12 w-full sm:w-auto"
              >
                Weiter: Beträge festlegen →
              </Button>
            </div>
          </section>
        )}

        {/* ── Step 2: Beträge festlegen ── */}
        {step === 2 && (
          <section className="space-y-6">
            <div>
              <h2 className="font-display font-bold text-xl md:text-2xl tracking-tight text-brand-night-navy">
                Wie viel pro Ereignis?
              </h2>
              <p className="mt-1 text-sm text-brand-night-navy/60">
                Leg fest, was jedes Ereignis wert ist. Optional: ein Cap pro Wette —
                begrenzt die Auszahlung pro Monat oder pro Saison (sinnvoll bei torreichen Teams).
              </p>
            </div>

            <div className="space-y-3">
              {fields.map((field, index) => {
                const def = TRIGGER_LIBRARY.find((t) => t.type === field.triggerType);
                return (
                  <div
                    key={field.id}
                    className="flex flex-wrap items-end gap-3 rounded-xl bg-white shadow-ios-card p-4"
                  >
                    <div className="flex-1 min-w-[180px]">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-brand-night-navy">
                        {def && <TriggerIcon type={def.type} className="h-4 w-4 shrink-0 text-accent-dark" />}
                        {def?.label}
                      </div>
                      <div className="text-xs text-brand-night-navy/50 mt-0.5 leading-snug">
                        {def?.description}
                      </div>
                    </div>

                    <FormField
                      control={form.control}
                      name={`rules.${index}.amountEur`}
                      render={({ field }) => (
                        <FormItem className="w-32">
                          <FormLabel className="text-xs text-brand-night-navy/60">Betrag (€)</FormLabel>
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
                    {!isSeasonTriggerType(field.triggerType) && (
                      <div className="flex items-end gap-2">
                        <FormField
                          control={form.control}
                          name={`rules.${index}.capEur`}
                          render={({ field: cf }) => (
                            <FormItem className="w-28">
                              <FormLabel className="text-xs text-brand-night-navy/60">Cap (€)</FormLabel>
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
                            <FormItem className="w-28">
                              <FormLabel className="text-xs text-brand-night-navy/60">pro</FormLabel>
                              <FormControl>
                                <select
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
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
                      </div>
                    )}

                    {field.triggerType === "goal_by_player" && (
                      <FormField
                        control={form.control}
                        name={`rules.${index}.params`}
                        render={({ field: pf }) => (
                          <FormItem className="w-56">
                            <FormLabel className="text-xs text-brand-night-navy/60">Spieler</FormLabel>
                            <FormControl>
                              {squadLoading ? (
                                <div className="h-10 rounded-md border border-brand-neutral/40 bg-brand-off-white animate-pulse" />
                              ) : squadPlayers.length > 0 ? (
                                <select
                                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                                <Input
                                  placeholder="z.B. Schmidt"
                                  value={(pf.value as Record<string, string>)?.player_name ?? ""}
                                  onChange={(e) =>
                                    pf.onChange({
                                      ...((pf.value as Record<string, unknown>) ?? {}),
                                      player_name: e.target.value,
                                    })
                                  }
                                />
                              )}
                            </FormControl>
                            <FormDescription className="text-xs">
                              Tore dieses Spielers zählen für dein Sponsoring.
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                    )}

                    {field.triggerType === "goals_scored_min" && (
                      <FormField
                        control={form.control}
                        name={`rules.${index}.params`}
                        render={({ field: pf }) => (
                          <FormItem className="w-32">
                            <FormLabel className="text-xs text-brand-night-navy/60">Min. Tore</FormLabel>
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
                            <FormDescription className="text-xs">
                              Ab wie vielen Toren der Betrag fällig wird.
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                    )}

                    {field.triggerType === "goal_diff_min" && (
                      <FormField
                        control={form.control}
                        name={`rules.${index}.params`}
                        render={({ field: pf }) => (
                          <FormItem className="w-32">
                            <FormLabel className="text-xs text-brand-night-navy/60">Min. Tordiff.</FormLabel>
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
                            <FormDescription className="text-xs">
                              Tordiff. ab der der Betrag fällig wird (z.B. 3 = mind. 3:0).
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                    )}

                    {field.triggerType === "season_table_position" && (
                      <div className="flex gap-2 items-end">
                        <FormField
                          control={form.control}
                          name={`rules.${index}.params`}
                          render={({ field: pf }) => (
                            <FormItem className="w-24">
                              <FormLabel className="text-xs text-brand-night-navy/60">Platz von</FormLabel>
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
                            <FormItem className="w-24">
                              <FormLabel className="text-xs text-brand-night-navy/60">bis Platz</FormLabel>
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
                      </div>
                    )}

                    {field.triggerType === "season_cup_round" && (
                      <FormField
                        control={form.control}
                        name={`rules.${index}.params`}
                        render={({ field: pf }) => (
                          <FormItem className="w-56">
                            <FormLabel className="text-xs text-brand-night-navy/60">Mindestens erreichte Runde</FormLabel>
                            <FormControl>
                              <select
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                            <FormDescription className="text-xs">
                              Zahlt 1×, wenn die Mannschaft mindestens diese Pokal-Runde erreicht.
                            </FormDescription>
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                className="min-h-12 w-full sm:w-auto"
              >
                ← Ereignisse ändern
              </Button>
              <Button
                type="button"
                variant="accent"
                size="lg"
                onClick={() => setStep(3)}
                className="min-h-12 w-full sm:w-auto"
              >
                Weiter: Zusammenfassung →
              </Button>
            </div>
          </section>
        )}

        {/* ── Step 3: Zusammenfassung & aktivieren ── */}
        {step === 3 && (
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
                    {watchedRules.map((r) => {
                      const def = TRIGGER_LIBRARY.find((t) => t.type === r.triggerType);
                      return (
                        <span
                          key={r.triggerType}
                          className="inline-flex items-center gap-1.5 rounded-full bg-white border border-accent/30 px-2.5 py-1 text-xs font-medium text-brand-night-navy"
                        >
                          {def && <TriggerIcon type={def.type} className="h-3.5 w-3.5 shrink-0 text-accent-dark" />}
                          {def?.label} — {r.amountEur} €
                        </span>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(2)}
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

// ─── Step Indicator ───────────────────────────────────────────────────────────

function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const steps = [
    { n: 1 as WizardStep, label: "Ereignisse" },
    { n: 2 as WizardStep, label: "Beträge" },
    { n: 3 as WizardStep, label: "Aktivieren" },
  ];

  return (
    <div className="flex items-center gap-0">
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
  def,
  enabled,
  onToggle,
}: {
  def: TriggerDef;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={enabled}
      className={
        "text-left rounded-xl border p-3 transition-colors " +
        (enabled
          ? "border-accent bg-accent/5"
          : "border-brand-neutral/40 bg-white hover:border-accent/40")
      }
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent-dark">
          <TriggerIcon type={def.type} className="h-[1.15rem] w-[1.15rem]" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-brand-night-navy">{def.label}</div>
          <div className="text-xs text-brand-night-navy/60 mt-0.5 leading-snug">{def.description}</div>
          {def.manual && (
            <div className="mt-1 inline-flex items-center text-[0.6rem] uppercase tracking-widest font-bold text-accent-dark bg-accent/10 px-1.5 py-0.5 rounded">
              Verein meldet
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
  const SPECIAL_GOAL_PER_GAME = 0.5;
  const HIGH_DIFF_RATE = 0.1;
  const FIVE_PLUS_GOALS_RATE = 0.1;

  return Math.round(
    rules.reduce((total, r) => {
      const cap = r.capEur ?? r.amountEur * 99;
      switch (r.triggerType) {
        case "goal_total":
        case "goal_by_player":
          return total + Math.min(r.amountEur * AVG_GOALS_PER_GAME, cap) * SAISON_GAMES;
        case "win":
          return total + r.amountEur * SAISON_GAMES * WIN_RATE;
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
        default:
          return total + r.amountEur;
      }
    }, 0)
  );
}
