"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Check, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TriggerIcon } from "@/components/shared/trigger-icon";
import { TRIGGER_META } from "@/lib/triggers/labels";
import { getTriggerLabel } from "@/lib/billing/trigger-labels";
import { isSeasonTriggerType } from "@/lib/validations/pledge";
import { CUP_ROUND_ORDER, CUP_ROUND_LABELS } from "@/lib/triggers/cup-rounds";
import { SPECIAL_GOAL_SUBTYPES } from "@/lib/triggers/special-goals";
import {
  updatePledgeRule,
  deletePledgeRule,
  addPledgeRule
} from "@/lib/actions/pledges";
import { requiresNamedScorers } from "@/lib/triggers/coverage";
import { eur } from "@/lib/utils/currency";

export type EditableRule = {
  id: string;
  triggerType: string;
  amountCents: number;
  capCents: number | null;
  capPeriod: "month" | "season" | null;
  params: Record<string, unknown>;
};

type CapPeriod = "month" | "season";

/** Param-Felder je nach Trigger-Typ. Schreibt snake_case (Engine normalisiert beim Speichern). */
function ParamFields({
  triggerType,
  params,
  onChange,
  playerNames
}: {
  triggerType: string;
  params: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  playerNames: string[];
}) {
  const set = (k: string, v: unknown) => onChange({ ...params, [k]: v });

  if (triggerType === "special_goal") {
    const val = (params.subtype as string) ?? "";
    return (
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        value={val}
        onChange={(e) => set("subtype", e.target.value)}
      >
        <option value="">Tor-Art wählen…</option>
        {SPECIAL_GOAL_SUBTYPES.map((s) => (
          <option key={s.value} value={s.value}>{s.label}</option>
        ))}
      </select>
    );
  }
  if (triggerType === "goal_by_player") {
    const val = (params.player_name as string) ?? (params.playerName as string) ?? "";
    return playerNames.length > 0 ? (
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        value={val}
        onChange={(e) => set("player_name", e.target.value)}
      >
        <option value="">Spieler wählen…</option>
        {playerNames.map((n) => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
    ) : (
      <Input className="h-9 w-40" placeholder="Spielername" value={val} onChange={(e) => set("player_name", e.target.value)} />
    );
  }
  if (triggerType === "goals_scored_min") {
    return (
      <Input className="h-9 w-24" type="number" min="2" max="20" placeholder="Min. Tore"
        value={(params.min_goals as number) ?? (params.minGoals as number) ?? ""}
        onChange={(e) => set("min_goals", Number(e.target.value))} />
    );
  }
  if (triggerType === "goal_diff_min") {
    return (
      <Input className="h-9 w-24" type="number" min="2" max="20" placeholder="Min. Diff"
        value={(params.min_diff as number) ?? (params.minDiff as number) ?? ""}
        onChange={(e) => set("min_diff", Number(e.target.value))} />
    );
  }
  if (triggerType === "season_cup_round") {
    const val = (params.min_round as string) ?? (params.minRound as string) ?? "";
    return (
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        value={val}
        onChange={(e) => set("min_round", e.target.value)}
      >
        <option value="">Runde wählen…</option>
        {CUP_ROUND_ORDER.map((r) => (
          <option key={r} value={r}>{CUP_ROUND_LABELS[r]}</option>
        ))}
      </select>
    );
  }
  return null;
}

function CapFields({
  triggerType,
  capCents,
  capPeriod,
  onChange
}: {
  triggerType: string;
  capCents: number | null;
  capPeriod: CapPeriod | null;
  onChange: (capCents: number | null, capPeriod: CapPeriod | null) => void;
}) {
  if (isSeasonTriggerType(triggerType)) return null;
  return (
    <div className="flex items-center gap-1.5">
      <Input
        className="h-9 w-24"
        type="number"
        min="0"
        placeholder="Cap €"
        value={capCents != null ? capCents / 100 : ""}
        onChange={(e) => {
          const v = e.target.value === "" ? null : Math.round(Number(e.target.value) * 100);
          onChange(v, v != null ? (capPeriod ?? "month") : null);
        }}
      />
      <select
        className="h-9 rounded-md border border-input bg-background px-1.5 text-sm disabled:opacity-50"
        value={capPeriod ?? "month"}
        disabled={capCents == null}
        onChange={(e) => onChange(capCents, e.target.value as CapPeriod)}
      >
        <option value="month">/ Monat</option>
        <option value="season">/ Saison</option>
      </select>
    </div>
  );
}

function RuleRow({
  rule,
  playerNames,
  disabled
}: {
  rule: EditableRule;
  playerNames: string[];
  disabled: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [amountEur, setAmountEur] = useState(String(rule.amountCents / 100));
  const [capCents, setCapCents] = useState<number | null>(rule.capCents);
  const [capPeriod, setCapPeriod] = useState<CapPeriod | null>(rule.capPeriod);
  const [params, setParams] = useState<Record<string, unknown>>(rule.params ?? {});

  function save() {
    const euros = parseFloat(amountEur.replace(",", "."));
    if (isNaN(euros) || euros < 0.5) {
      toast.error("Betrag muss mindestens 0,50 € sein.");
      return;
    }
    start(async () => {
      const res = await updatePledgeRule(rule.id, {
        amountCents: Math.round(euros * 100),
        capCents,
        capPeriod: capPeriod ?? undefined,
        params
      });
      if (res.error) { toast.error(res.error); return; }
      toast.success("Regel gespeichert.");
      setEditing(false);
      router.refresh();
    });
  }

  function del() {
    start(async () => {
      const res = await deletePledgeRule(rule.id);
      if (res.error) { toast.error(res.error); return; }
      toast.success("Regel gelöscht.");
      router.refresh();
    });
  }

  if (!editing) {
    return (
      <li className="rounded-lg bg-white shadow-ios-card p-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <TriggerIcon type={rule.triggerType as keyof typeof TRIGGER_META} className="h-4 w-4 shrink-0 text-accent-dark" />
          <div className="min-w-0">
            <div className="font-semibold text-brand-night-navy truncate">{getTriggerLabel(rule.triggerType, rule.params)}</div>
            {rule.capCents != null && (
              <div className="text-xs text-brand-night-navy/60 mt-0.5">
                Max {eur(rule.capCents)} / {rule.capPeriod === "season" ? "Saison" : "Monat"}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono tabular-nums text-lg font-semibold text-brand-night-navy">{eur(rule.amountCents)}</span>
          {!disabled && (
            <>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditing(true)} title="Bearbeiten">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={del} disabled={pending} title="Löschen">
                <Trash2 className="h-3.5 w-3.5 text-red-500" />
              </Button>
            </>
          )}
        </div>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-accent/50 bg-accent/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <TriggerIcon type={rule.triggerType as keyof typeof TRIGGER_META} className="h-4 w-4 shrink-0 text-accent-dark" />
        <span className="font-semibold text-brand-night-navy">{getTriggerLabel(rule.triggerType, params)}</span>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-brand-night-navy/60">
          Betrag (€)
          <Input className="h-9 w-24 mt-1" type="number" step="0.5" min="0.5" value={amountEur} onChange={(e) => setAmountEur(e.target.value)} />
        </label>
        <CapFields triggerType={rule.triggerType} capCents={capCents} capPeriod={capPeriod}
          onChange={(c, p) => { setCapCents(c); setCapPeriod(p); }} />
        <ParamFields triggerType={rule.triggerType} params={params} onChange={setParams} playerNames={playerNames} />
        <div className="flex items-center gap-1.5 ml-auto">
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={save} disabled={pending} title="Speichern">
            <Check className="h-4 w-4 text-emerald-600" />
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditing(false)} disabled={pending} title="Abbrechen">
            <X className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </div>
    </li>
  );
}

function AddBet({
  pledgeId,
  playerNames,
  existingTypes,
  playerBetsAllowed
}: {
  pledgeId: string;
  playerNames: string[];
  existingTypes: string[];
  playerBetsAllowed: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [triggerType, setTriggerType] = useState("");
  const [amountEur, setAmountEur] = useState("5");
  const [capCents, setCapCents] = useState<number | null>(null);
  const [capPeriod, setCapPeriod] = useState<CapPeriod | null>(null);
  const [params, setParams] = useState<Record<string, unknown>>({});

  const options = (Object.keys(TRIGGER_META) as (keyof typeof TRIGGER_META)[])
    .filter((t) => TRIGGER_META[t].auto || ["special_goal", "season_cup_round", "season_custom"].includes(t))
    // special_goal darf mehrfach existieren (eine Regel je Tor-Art), die übrigen
    // Typen nur einmal.
    .filter((t) => t === "special_goal" || !existingTypes.includes(t))
    // Spieler-Wetten (goal_by_player, hattrick) nur anbieten, wenn fußball.de für
    // diese Mannschaft Torschützen liefert (`full`). Siehe lib/triggers/coverage.ts.
    .filter((t) => playerBetsAllowed || !requiresNamedScorers(t));

  function add() {
    if (!triggerType) { toast.error("Regel-Typ wählen."); return; }
    if (triggerType === "special_goal" && !params.subtype) {
      toast.error("Bitte eine Tor-Art wählen.");
      return;
    }
    const euros = parseFloat(amountEur.replace(",", "."));
    if (isNaN(euros) || euros < 0.5) { toast.error("Betrag muss mindestens 0,50 € sein."); return; }
    start(async () => {
      const res = await addPledgeRule(pledgeId, {
        triggerType,
        amountCents: Math.round(euros * 100),
        capCents,
        capPeriod: capPeriod ?? undefined,
        params
      });
      if (res.error) { toast.error(res.error); return; }
      toast.success("Regel hinzugefügt.");
      setOpen(false);
      setTriggerType(""); setAmountEur("5"); setCapCents(null); setCapPeriod(null); setParams({});
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1.5" /> Regel hinzufügen
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-accent/50 bg-accent/5 p-4 space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-brand-night-navy/60">
          Ereignis
          <select
            className="h-9 mt-1 block rounded-md border border-input bg-background px-2 text-sm min-w-48"
            value={triggerType}
            onChange={(e) => { setTriggerType(e.target.value); setParams({}); setCapCents(null); setCapPeriod(null); }}
          >
            <option value="">Wählen…</option>
            {options.map((t) => (
              <option key={t} value={t}>{TRIGGER_META[t].emoji} {TRIGGER_META[t].label}{TRIGGER_META[t].scope === "season" ? " (Saison)" : ""}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-brand-night-navy/60">
          Betrag (€)
          <Input className="h-9 w-24 mt-1" type="number" step="0.5" min="0.5" value={amountEur} onChange={(e) => setAmountEur(e.target.value)} />
        </label>
        {triggerType && (
          <CapFields triggerType={triggerType} capCents={capCents} capPeriod={capPeriod}
            onChange={(c, p) => { setCapCents(c); setCapPeriod(p); }} />
        )}
        {triggerType && (
          <ParamFields triggerType={triggerType} params={params} onChange={setParams} playerNames={playerNames} />
        )}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Abbrechen</Button>
        <Button variant="accent" onClick={add} disabled={pending}>{pending ? "…" : "Hinzufügen"}</Button>
      </div>
    </div>
  );
}

export function PledgeRulesEditor({
  pledgeId,
  rules,
  playerNames,
  pledgeEnded,
  playerBetsAllowed = true
}: {
  pledgeId: string;
  rules: EditableRule[];
  playerNames: string[];
  pledgeEnded: boolean;
  /**
   * Ob für die Mannschaft Spieler-Wetten anlegbar sind (Coverage `full` oder
   * unklassifiziert). Bei `false` werden goal_by_player/hattrick im „Regel
   * hinzufügen"-Dialog ausgeblendet — bereits bestehende Spieler-Regeln bleiben
   * aber editierbar (Grandfather).
   */
  playerBetsAllowed?: boolean;
}) {
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {rules.map((r) => (
          <RuleRow key={r.id} rule={r} playerNames={playerNames} disabled={pledgeEnded} />
        ))}
      </ul>
      {!pledgeEnded && (
        <AddBet
          pledgeId={pledgeId}
          playerNames={playerNames}
          existingTypes={rules.map((r) => r.triggerType)}
          playerBetsAllowed={playerBetsAllowed}
        />
      )}
    </div>
  );
}
