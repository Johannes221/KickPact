"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import {
  pledgeInputSchema,
  TRIGGER_TYPES,
  type PledgeInput,
  type TriggerType
} from "@/lib/validations/pledge";
import { createPledge } from "../_actions/create-pledge";
import { toast } from "sonner";

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
  // Pro Spiel
  { category: "match", type: "goal_total", label: "Pro Tor", emoji: "⚽", description: "Für jedes Tor der eigenen Mannschaft", defaultEur: 5 },
  { category: "match", type: "win", label: "Pro Sieg", emoji: "🏆", description: "Einmal pro gewonnenem Spiel", defaultEur: 10 },
  { category: "match", type: "clean_sheet", label: "Pro Zu-Null-Sieg", emoji: "🛡️", description: "Gewonnen + 0 Gegentore", defaultEur: 5 },
  { category: "match", type: "comeback_win", label: "Pro Comeback-Sieg", emoji: "🔥", description: "Halbzeit hinten, am Ende vorne", defaultEur: 20 },
  { category: "match", type: "hattrick", label: "Pro Hattrick", emoji: "🎯", description: "1 Spieler ≥3 Tore in einem Spiel", defaultEur: 25 },
  { category: "match", type: "goal_by_player", label: "Tore von Spieler X", emoji: "💎", description: "Wähle deinen Lieblings-Spieler", defaultEur: 3 },
  { category: "match", type: "special_goal", label: "Spezial-Tor", emoji: "🎭", description: "Kopfball, Hackentor, Elfmeter — Verein meldet, du bestätigst", defaultEur: 10, manual: true },
  { category: "match", type: "goals_scored_min", label: "Mind. X Tore", emoji: "🎉", description: "z.B. ab 5 Toren pro Spiel", defaultEur: 30 },
  { category: "match", type: "goal_diff_min", label: "Hoher Sieg (Diff ≥X)", emoji: "💪", description: "z.B. Tordifferenz ≥3", defaultEur: 15 },
  // Pro Saison — feuert 1× am Saisons-Ende
  { category: "season", type: "season_promotion", label: "Aufstieg", emoji: "⬆️", description: "1× wenn die Mannschaft aufsteigt", defaultEur: 200 },
  { category: "season", type: "season_no_relegation", label: "Klassenerhalt", emoji: "🛟", description: "1× wenn nicht abgestiegen", defaultEur: 100 },
  { category: "season", type: "season_champion", label: "Meister-Titel", emoji: "👑", description: "1× wenn Tabellenplatz 1 am Saisons-Ende", defaultEur: 300 },
  { category: "season", type: "season_table_position", label: "Endplatz im Bereich", emoji: "🥇", description: "z.B. Platz 1–5 (Range im Params)", defaultEur: 75 },
  { category: "season", type: "season_cup_round", label: "Pokal-Runde", emoji: "🏆", description: "z.B. Halbfinale erreicht — Verein meldet, du bestätigst", defaultEur: 150, manual: true },
  { category: "season", type: "season_custom", label: "Eigenes Saison-Ziel", emoji: "🎺", description: "z.B. '20 Tore mehr als letzte Saison' — Verein meldet, du bestätigst", defaultEur: 50, manual: true }
];

export function PledgeBuilder() {
  const router = useRouter();
  const params = useSearchParams();
  const invitationToken = params.get("invitation");
  const [pending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState<Set<TriggerType>>(new Set(["goal_total", "win"]));

  const form = useForm<PledgeInput>({
    resolver: zodResolver(pledgeInputSchema),
    defaultValues: {
      invitationToken: invitationToken ?? "",
      rules: [
        { triggerType: "goal_total", amountEur: 5, params: {} },
        { triggerType: "win", amountEur: 10, params: {} }
      ],
      monthlyCapEur: undefined,
      endsAtSaisonEnd: true
    }
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "rules"
  });

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
      toast.error("Mindestens eine Regel auswählen");
      return;
    }
    startTransition(async () => {
      try {
        const { pledgeId } = await createPledge(values);
        toast.success("Pledge ist live 🎉");
        router.push(`/sponsor/pledge/${pledgeId}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler beim Speichern");
      }
    });
  }

  // Worst-Case-Berechnung (vereinfachte Heuristik)
  const watchedRules = form.watch("rules");
  const watchedMonthly = form.watch("monthlyCapEur");
  const worstCasePerSaison = estimateWorstCase(watchedRules);
  const worstCasePerMonth = Math.round(worstCasePerSaison / 9); // 9 Monate Saison

  if (!invitationToken) {
    return (
      <div className="rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-4 text-sm text-brand-alert-red">
        Kein Einladungs-Token. Bitte über den Vereins-Einladungslink kommen.
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-10">
        {/* Trigger-Library — gruppiert nach Pro-Spiel + Pro-Saison */}
        <section className="space-y-4">
          <Label className="text-sm font-semibold uppercase tracking-widest text-brand-night-navy/50">
            1.  Welche Trigger soll dein Pledge haben?
          </Label>

          <div>
            <h4 className="text-xs uppercase tracking-widest font-bold text-accent-dark mb-2 md:mb-3">
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

          <div className="mt-5 md:mt-6">
            <h4 className="text-xs uppercase tracking-widest font-bold text-accent-dark mb-2 md:mb-3">
              🏆 Pro Saison <span className="ml-1 text-brand-night-navy/40 font-normal normal-case tracking-normal">— 1× am Saison-Ende</span>
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
        </section>

        {/* Beträge */}
        {fields.length > 0 && (
          <section className="space-y-4">
            <Label className="text-sm font-semibold uppercase tracking-widest text-brand-night-navy/50">
              2.  Beträge festlegen
            </Label>
            <div className="space-y-3">
              {fields.map((field, index) => {
                const def = TRIGGER_LIBRARY.find((t) => t.type === field.triggerType);
                return (
                  <div
                    key={field.id}
                    className="flex flex-wrap items-end gap-3 rounded-lg border border-brand-neutral/40 bg-white p-4"
                  >
                    <div className="flex-1 min-w-[200px]">
                      <div className="text-sm font-semibold text-brand-night-navy">
                        {def?.emoji}  {def?.label}
                      </div>
                      <div className="text-xs text-brand-night-navy/50 mt-0.5">{def?.description}</div>
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
                    <FormField
                      control={form.control}
                      name={`rules.${index}.perMatchCapEur`}
                      render={({ field }) => (
                        <FormItem className="w-32">
                          <FormLabel className="text-xs text-brand-night-navy/60">Spiel-Cap (€)</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              placeholder="optional"
                              value={field.value ?? ""}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.value === "" ? undefined : Number(e.target.value)
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Monats-Cap + Laufzeit */}
        <section className="grid gap-6 md:grid-cols-2">
          <FormField
            control={form.control}
            name="monthlyCapEur"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-brand-night-navy">
                  3.  Monats-Cap (empfohlen)
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
                  Wir empfehlen einen Cap: Egal wie geil die Mannschaft drauf ist — du zahlst
                  nie mehr als hier eingetragen.
                </p>
                {!watchedMonthly && (
                  <p className="text-xs text-brand-alert-red mt-1">
                    ⚠️  Kein Cap = unbegrenzt. Du behältst die Kontrolle nur teilweise.
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
                      Pledge endet zur Saison
                    </FormLabel>
                    <p className="text-xs text-brand-night-navy/60 mt-1">
                      Du musst nach Saison-Ende erneuern. Empfohlen — kein „läuft weiter ohne
                      mich"-Effekt.
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
        </section>

        {/* Worst-Case */}
        <Card className="border-accent/40 bg-accent/5">
          <CardHeader>
            <CardTitle className="font-display font-black text-lg tracking-tight text-brand-night-navy">
              💰  Worst-Case-Hochrechnung
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
                  Pro Saison
                </div>
                <div className="mt-1 font-display font-black text-3xl tracking-tight text-accent">
                  {watchedMonthly
                    ? `≤ ${Math.min(worstCasePerSaison, watchedMonthly * 9)} €`
                    : `≈ ${worstCasePerSaison} €`}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
                  Pro Monat (geschätzt)
                </div>
                <div className="mt-1 font-display font-black text-3xl tracking-tight text-brand-night-navy">
                  {watchedMonthly ? `≤ ${watchedMonthly} €` : `≈ ${worstCasePerMonth} €`}
                </div>
              </div>
            </div>
            <p className="mt-4 text-xs text-brand-night-navy/60">
              Annahme: 18 Saison-Spiele, ⌀ 2 Tore eigene Mannschaft, 50% Sieg-Quote.
              Konservative Hochrechnung — Realität meistens niedriger.
            </p>
          </CardContent>
        </Card>

        <Button
          type="submit"
          variant="accent"
          size="lg"
          disabled={pending || fields.length === 0}
          className="w-full"
        >
          {pending ? "Speichere…" : "Pledge aktivieren →"}
        </Button>
      </form>
    </Form>
  );
}

function TriggerToggle({
  def,
  enabled,
  onToggle
}: {
  def: TriggerDef;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={
        "text-left rounded-lg border p-3 transition-colors " +
        (enabled
          ? "border-accent bg-accent/5"
          : "border-brand-neutral/40 bg-white hover:border-accent/40")
      }
    >
      <div className="flex items-start gap-2">
        <span className="text-xl">{def.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-brand-night-navy">{def.label}</div>
          <div className="text-xs text-brand-night-navy/60 mt-0.5 leading-snug">
            {def.description}
          </div>
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

function estimateWorstCase(rules: { triggerType: string; amountEur: number; perMatchCapEur?: number }[]): number {
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
      const cap = r.perMatchCapEur ?? r.amountEur * 99;
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
