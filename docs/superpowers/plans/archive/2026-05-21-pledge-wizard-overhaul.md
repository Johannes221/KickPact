# Pledge Wizard Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken `/sponsor/pledge` 404, rename all "Trigger/Aufbauen" terminology to "Ereignisse/einrichten", rebuild the single-page pledge form into a 3-step wizard, and add a fussball.de Kader player picker for the "Tore von Spieler X" event.

**Architecture:** The pledge builder stays react-hook-form + Zod; we add a `step` state variable to gate which form sections render. `getKader()` is added to `lib/crawler/fussballde.ts` using Playwright (consistent with existing crawlers). A new `/api/squad` route resolves an `invitationToken` to the team's fussball.de IDs and returns the squad list as JSON. The wizard's player picker replaces the free-text input in Step 2 with a `<select>` loaded from that route.

**Tech Stack:** Next.js 15 App Router, Drizzle ORM, react-hook-form v7 + Zod, Playwright, shadcn/ui (Button, Input, Card, Form), Tailwind v3.4, Vitest

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `app/(sponsor)/sponsor/pledge/page.tsx` | **CREATE** | Pledge list page (fixes 404 on "Wetten" nav tab) |
| `app/(sponsor)/sponsor/pledge/new/page.tsx` | **MODIFY** | Rename "aufbauen" → "einrichten", "Trigger" → "Ereignisse" |
| `app/(sponsor)/sponsor/pledge/new/_components/pledge-builder.tsx` | **REWRITE** | 3-step wizard + player picker |
| `lib/crawler/fussballde.ts` | **MODIFY** | Add `getKader()` function |
| `app/api/squad/route.ts` | **CREATE** | GET /api/squad?invitationToken=XXX |
| `tests/api/squad.test.ts` | **CREATE** | Unit tests for squad route (mocked) |

---

## Task 1: Fix 404 — Create `/sponsor/pledge/page.tsx`

**Files:**
- Create: `app/(sponsor)/sponsor/pledge/page.tsx`

The "Wetten" tab in `sponsor-sub-nav.tsx` links to `/sponsor/pledge`. No `page.tsx` exists at that path → 404. This page should list the sponsor's existing pledges, each linking to `/sponsor/pledge/[id]`, with a note on how to create more (via invitation link from the club).

- [ ] **Step 1: Create the pledge list page**

```typescript
// app/(sponsor)/sponsor/pledge/page.tsx
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { db } from "@/lib/db/client";
import { pledges, sponsors, teams, clubs } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Meine Wetten · KickPact" };

function eur(cents: number) {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export default async function PledgeListPage() {
  const user = await requireUser();

  const [sponsor] = await db
    .select({ id: sponsors.id })
    .from(sponsors)
    .where(eq(sponsors.userId, user.id))
    .limit(1);

  const myPledges = sponsor
    ? await db
        .select({
          id: pledges.id,
          status: pledges.status,
          startsAt: pledges.startsAt,
          endsAt: pledges.endsAt,
          monthlyCapCents: pledges.monthlyCapCents,
          teamName: teams.name,
          clubName: clubs.name,
        })
        .from(pledges)
        .innerJoin(teams, eq(pledges.teamId, teams.id))
        .innerJoin(clubs, eq(teams.clubId, clubs.id))
        .where(eq(pledges.sponsorId, sponsor.id))
        .orderBy(desc(pledges.startsAt))
    : [];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
        Meine <span className="text-accent">Wetten</span>
      </h1>
      <p className="mt-1.5 md:mt-2 text-sm md:text-base text-brand-night-navy/60 max-w-2xl">
        Hier siehst du alle deine aktiven und vergangenen Sponsoring-Versprechen.
      </p>

      <div className="mt-6 md:mt-10 space-y-3">
        {myPledges.length === 0 ? (
          <Card className="border-brand-neutral/40">
            <CardContent className="p-6 text-center text-brand-night-navy/60 text-sm">
              <p className="font-semibold text-brand-night-navy">Noch keine Wetten.</p>
              <p className="mt-1">
                Du brauchst einen Einladungslink deines Vereins, um eine Wette einzurichten.
                Frag deinen Ansprechpartner im Verein nach dem Link.
              </p>
            </CardContent>
          </Card>
        ) : (
          myPledges.map((p) => (
            <Link
              key={p.id}
              href={`/sponsor/pledge/${p.id}`}
              className="block rounded-xl border border-brand-neutral/40 bg-white p-4 hover:border-accent/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-brand-night-navy">{p.teamName}</div>
                  <div className="text-xs text-brand-night-navy/50 mt-0.5">{p.clubName}</div>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-3 flex gap-4 text-xs text-brand-night-navy/60">
                <span>
                  {new Date(p.startsAt).toLocaleDateString("de-DE")} –{" "}
                  {new Date(p.endsAt).toLocaleDateString("de-DE")}
                </span>
                {p.monthlyCapCents && (
                  <span>Cap: {eur(p.monthlyCapCents)} / Monat</span>
                )}
              </div>
            </Link>
          ))
        )}
      </div>

      <div className="mt-8 rounded-lg border border-brand-neutral/40 bg-brand-off-white p-4 text-sm text-brand-night-navy/60">
        <strong className="text-brand-night-navy">Neue Wette einrichten?</strong>
        <p className="mt-1">
          Wetten werden über den Einladungslink eines Vereins erstellt. Bitte deinen
          Ansprechpartner im Verein, dir den Link zu schicken.
        </p>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "Aktiv", cls: "bg-emerald-100 text-emerald-800" },
    paused: { label: "Pausiert", cls: "bg-amber-100 text-amber-800" },
    cancelled: { label: "Gekündigt", cls: "bg-rose-100 text-rose-700" },
    completed: { label: "Abgeschlossen", cls: "bg-neutral-100 text-neutral-600" },
  };
  const entry = map[status] ?? { label: status, cls: "bg-neutral-100 text-neutral-600" };
  return (
    <span className={"inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold " + entry.cls}>
      {entry.label}
    </span>
  );
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd /Users/johan/kickpact && npx tsc --noEmit 2>&1 | grep -i "pledge/page"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(sponsor)/sponsor/pledge/page.tsx"
git commit -m "feat: add /sponsor/pledge list page — fixes 404 on Wetten nav tab"
```

---

## Task 2: Rename Terminology — "Trigger" → "Ereignisse", "aufbauen" → "einrichten"

**Files:**
- Modify: `app/(sponsor)/sponsor/pledge/new/page.tsx`
- Modify: `app/(sponsor)/sponsor/pledge/new/_components/pledge-builder.tsx`

- [ ] **Step 1: Update page.tsx heading and subtitle**

In `app/(sponsor)/sponsor/pledge/new/page.tsx`, change:

```typescript
// OLD:
<h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
  Pledge <span className="text-accent">aufbauen</span>
</h1>
<p className="mt-1.5 md:mt-2 text-sm md:text-base text-brand-night-navy/60 max-w-2xl">
  Wähle Trigger, leg Beträge fest. Wir zeigen dir live, worauf du dich maximal einlässt.
</p>
```

To:

```typescript
// NEW:
<h1 className="font-display font-black text-2xl md:text-4xl lg:text-5xl tracking-tight text-brand-night-navy">
  Sponsoring <span className="text-accent">einrichten</span>
</h1>
<p className="mt-1.5 md:mt-2 text-sm md:text-base text-brand-night-navy/60 max-w-2xl">
  Wähle Ereignisse, lege Beträge fest. Wir zeigen dir live, worauf du dich maximal einlässt.
</p>
```

- [ ] **Step 2: Update pledge-builder.tsx section labels**

In `pledge-builder.tsx`, change the section labels (these will be replaced in Task 3 by wizard steps anyway, but do it now to establish correct wording):

Line 135–137: change
```
1.  Welche Trigger soll dein Pledge haben?
```
to
```
1.  Welche Ereignisse soll dein Sponsoring haben?
```

Line 114 (detail page `TRIGGER_LABELS`): this is in `[id]/page.tsx`, not pledge-builder — leave for now (detail page uses "Trigger-Regeln" as heading on line 113, update that too):

In `app/(sponsor)/sponsor/pledge/[id]/page.tsx` line 113, change:
```typescript
<h2 className="mt-8 md:mt-12 font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy">
  Trigger-Regeln
</h2>
```
to:
```typescript
<h2 className="mt-8 md:mt-12 font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy">
  Ereignisse
</h2>
```

- [ ] **Step 3: Update metadata title**

In `app/(sponsor)/sponsor/pledge/new/page.tsx`, change:
```typescript
export const metadata = { title: "Pledge anlegen · KickPact" };
```
to:
```typescript
export const metadata = { title: "Sponsoring einrichten · KickPact" };
```

- [ ] **Step 4: Verify TypeScript**

```bash
cd /Users/johan/kickpact && npx tsc --noEmit 2>&1 | grep -E "pledge/new|pledge/\[id\]"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(sponsor)/sponsor/pledge/new/page.tsx" \
        "app/(sponsor)/sponsor/pledge/new/_components/pledge-builder.tsx" \
        "app/(sponsor)/sponsor/pledge/[id]/page.tsx"
git commit -m "refactor: rename Trigger→Ereignisse, aufbauen→einrichten throughout pledge UI"
```

---

## Task 3: Rebuild Pledge Builder as 3-Step Wizard

**Files:**
- Rewrite: `app/(sponsor)/sponsor/pledge/new/_components/pledge-builder.tsx`

The wizard has 3 steps:
- **Step 1 — Ereignisse wählen**: The TriggerToggle grid. "Weiter →" button enabled only when ≥1 event selected.
- **Step 2 — Beträge festlegen**: Amount inputs, per-match caps, and special inputs (player picker, min goals, min diff, etc.) for the selected rules only.
- **Step 3 — Zusammenfassung & aktivieren**: Monthly cap, end date toggle, worst-case card, and submit button.

The react-hook-form + zod schema stays identical (`pledgeInputSchema`). Only the rendering is split.

- [ ] **Step 1: Write the new pledge-builder.tsx**

Replace the entire file at `app/(sponsor)/sponsor/pledge/new/_components/pledge-builder.tsx`:

```tsx
"use client";

import { useState, useTransition, useEffect } from "react";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  pledgeInputSchema,
  type PledgeInput,
  type TriggerType,
} from "@/lib/validations/pledge";
import { createPledge } from "../_actions/create-pledge";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

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
  // Pro Saison
  { category: "season", type: "season_promotion", label: "Aufstieg", emoji: "⬆️", description: "1× wenn die Mannschaft aufsteigt", defaultEur: 200 },
  { category: "season", type: "season_no_relegation", label: "Klassenerhalt", emoji: "🛟", description: "1× wenn nicht abgestiegen", defaultEur: 100 },
  { category: "season", type: "season_champion", label: "Meister-Titel", emoji: "👑", description: "1× wenn Tabellenplatz 1 am Saison-Ende", defaultEur: 300 },
  { category: "season", type: "season_table_position", label: "Endplatz im Bereich", emoji: "🥇", description: "z.B. Platz 1–5 (Range)", defaultEur: 75 },
  { category: "season", type: "season_cup_round", label: "Pokal-Runde", emoji: "🏆", description: "z.B. Halbfinale erreicht — Verein meldet, du bestätigst", defaultEur: 150, manual: true },
  { category: "season", type: "season_custom", label: "Eigenes Saison-Ziel", emoji: "🎺", description: "Verein meldet, du bestätigst", defaultEur: 50, manual: true },
];

// ─── Component ────────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3;

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
    if (step === 2 && enabled.has("goal_by_player") && squadPlayers.length === 0 && invitationToken) {
      setSquadLoading(true);
      fetch(`/api/squad?invitationToken=${encodeURIComponent(invitationToken)}`)
        .then((r) => r.json())
        .then((data: { players?: string[] }) => {
          if (data.players) setSquadPlayers(data.players);
        })
        .catch(() => {/* ignore — player name fallback to text input */})
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

        {/* Step indicator */}
        <StepIndicator currentStep={step} />

        {/* ── Step 1: Ereignisse wählen ── */}
        {step === 1 && (
          <section className="space-y-6">
            <div>
              <h2 className="font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy">
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

            <div className="flex justify-end">
              <Button
                type="button"
                variant="accent"
                size="lg"
                disabled={enabled.size === 0}
                onClick={() => setStep(2)}
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
              <h2 className="font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy">
                Wie viel pro Ereignis?
              </h2>
              <p className="mt-1 text-sm text-brand-night-navy/60">
                Leg fest, was jedes Ereignis wert ist. Der Spiel-Cap begrenzt pro Spiel.
              </p>
            </div>

            <div className="space-y-3">
              {fields.map((field, index) => {
                const def = TRIGGER_LIBRARY.find((t) => t.type === field.triggerType);
                return (
                  <div
                    key={field.id}
                    className="flex flex-wrap items-end gap-3 rounded-xl border border-brand-neutral/40 bg-white p-4"
                  >
                    <div className="flex-1 min-w-[180px]">
                      <div className="text-sm font-semibold text-brand-night-navy">
                        {def?.emoji} {def?.label}
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
                                field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* goal_by_player: player picker or text fallback */}
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

                    {/* goals_scored_min: min goals input */}
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

                    {/* goal_diff_min: min diff input */}
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

                    {/* season_table_position: range inputs */}
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
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between gap-3">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                ← Ereignisse ändern
              </Button>
              <Button type="button" variant="accent" size="lg" onClick={() => setStep(3)}>
                Weiter: Zusammenfassung →
              </Button>
            </div>
          </section>
        )}

        {/* ── Step 3: Zusammenfassung & aktivieren ── */}
        {step === 3 && (
          <section className="space-y-6">
            <div>
              <h2 className="font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy">
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
                          Pledge endet zur Saison
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

            {/* Worst-Case Card */}
            <Card className="border-accent/40 bg-accent/5">
              <CardHeader>
                <CardTitle className="font-display font-black text-lg tracking-tight text-brand-night-navy">
                  💰 Worst-Case-Hochrechnung
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
                  Annahme: 18 Saison-Spiele, ⌀ 2 Tore, 50% Sieg-Quote. Konservative Hochrechnung.
                </p>

                {/* Selected events summary */}
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
                          className="inline-flex items-center gap-1 rounded-full bg-white border border-accent/30 px-2.5 py-1 text-xs font-medium text-brand-night-navy"
                        >
                          {def?.emoji} {def?.label} — {r.amountEur} €
                        </span>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between gap-3">
              <Button type="button" variant="outline" onClick={() => setStep(2)}>
                ← Beträge anpassen
              </Button>
              <Button
                type="submit"
                variant="accent"
                size="lg"
                disabled={pending || fields.length === 0}
                className="flex-1 md:flex-none"
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
      className={
        "text-left rounded-xl border p-3 transition-colors " +
        (enabled
          ? "border-accent bg-accent/5"
          : "border-brand-neutral/40 bg-white hover:border-accent/40")
      }
    >
      <div className="flex items-start gap-2">
        <span className="text-xl">{def.emoji}</span>
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
  rules: { triggerType: string; amountEur: number; perMatchCapEur?: number }[]
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
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/johan/kickpact && npx tsc --noEmit 2>&1 | grep -i "pledge-builder"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(sponsor)/sponsor/pledge/new/_components/pledge-builder.tsx"
git commit -m "feat: rebuild pledge builder as 3-step wizard (Ereignisse → Beträge → Aktivieren)"
```

---

## Task 4: Add `getKader()` to fussballde.ts

**Files:**
- Modify: `lib/crawler/fussballde.ts`

The fussball.de squad page is at:
`https://www.fussball.de/mannschaft/${slug}/-/saison/${saison}/team-id/${teamId}#!/`

Player names are in the Kader table with links `a[href*="spielerprofil"]`. Unlike `getSpielDetails`, the names are available inline in the kader table rows (no individual profile page visits required).

- [ ] **Step 1: Add KaderPlayer interface and getKader() at end of fussballde.ts**

Add to the END of `lib/crawler/fussballde.ts` (after line 369, after `getSpielDetails`):

```typescript
export interface KaderPlayer {
  name: string;
  spielerId?: string;
}

export async function getKader(
  teamId: string,
  slug: string,
  saison: string
): Promise<KaderPlayer[]> {
  return withPage(async (page) => {
    const url = `https://www.fussball.de/mannschaft/${slug}/-/saison/${saison}/team-id/${teamId}#!/`;
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    return await page.evaluate(`(function() {
      var players = [];
      var seen = new Set();

      // Strategy 1: kader table rows with player profile links
      document.querySelectorAll('a[href*="spielerprofil"]').forEach(function(link) {
        var href = link.href || link.getAttribute("href") || "";
        var idMatch = href.match(/\\/(?:player-id|userid)\\/([A-Z0-9]+)/i);
        var id = idMatch ? idMatch[1] : null;
        if (id && seen.has(id)) return;
        var name = (link.textContent || "").replace(/\\s+/g, " ").trim();
        if (name.length < 2) return;
        if (id) seen.add(id);
        players.push({ name: name, spielerId: id || undefined });
      });

      // Strategy 2: .column-name cells in kader tables (fallback if links have no text)
      if (players.length === 0) {
        document.querySelectorAll('.column-name').forEach(function(cell) {
          var name = (cell.textContent || "").replace(/\\s+/g, " ").trim();
          if (name.length > 1 && !seen.has(name)) {
            seen.add(name);
            players.push({ name: name });
          }
        });
      }

      return players;
    })()`) as KaderPlayer[];
  });
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/johan/kickpact && npx tsc --noEmit 2>&1 | grep -i "fussballde"
```

Expected: no errors.

- [ ] **Step 3: Quick smoke test with real team**

```bash
cd /Users/johan/kickpact && npx dotenv -e .env.local -- npx tsx -e "
import { getKader } from './lib/crawler/fussballde';
// Dossenheim 3 IDs from DB
getKader('011MIC8NC4000000VS548898VVVU4I4L', 'sv-dossenheim-3---herren-kreisliga', '2526')
  .then(p => console.log('Players:', p.slice(0, 5)))
  .catch(e => console.error(e));
"
```

Expected: array with player name objects printed.

Note: If the teamId/slug are unknown, query DB first:
```bash
cd /Users/johan/kickpact && npx dotenv -e .env.local -- npx tsx -e "
import { db } from './lib/db/client';
import { teams } from './lib/db/schema';
db.select({ name: teams.name, teamId: teams.fussballdeTeamId, slug: teams.fussballdeSlug }).from(teams).then(t => { console.log(t); process.exit(0); });
"
```

- [ ] **Step 4: Commit**

```bash
git add lib/crawler/fussballde.ts
git commit -m "feat: add getKader() to fussballde crawler for squad player names"
```

---

## Task 5: Create `/api/squad` Route

**Files:**
- Create: `app/api/squad/route.ts`

This API route resolves an `invitationToken` → `teamId` → `fussballdeTeamId` / `fussballdeSlug` → calls `getKader()` → returns JSON `{ players: string[] }`.

- [ ] **Step 1: Create the route**

```typescript
// app/api/squad/route.ts
import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { teams } from "@/lib/db/schema";
import { findInvitationByToken } from "@/lib/db/queries/invitations";
import { getKader } from "@/lib/crawler/fussballde";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("invitationToken");
  if (!token) {
    return NextResponse.json({ error: "invitationToken required" }, { status: 400 });
  }

  const invitation = await findInvitationByToken(token);
  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  const [team] = await db
    .select({
      fussballdeTeamId: teams.fussballdeTeamId,
      fussballdeSlug: teams.fussballdeSlug,
    })
    .from(teams)
    .where(eq(teams.id, invitation.teamId))
    .limit(1);

  if (!team?.fussballdeTeamId || !team?.fussballdeSlug) {
    // Team has no fussball.de link — return empty list, not an error
    return NextResponse.json({ players: [] });
  }

  // Determine current season: e.g. today=2026-05-21 → saison "2526"
  const now = new Date();
  const saison =
    now.getMonth() >= 6
      ? `${String(now.getFullYear()).slice(2)}${String(now.getFullYear() + 1).slice(2)}`
      : `${String(now.getFullYear() - 1).slice(2)}${String(now.getFullYear()).slice(2)}`;

  try {
    const kader = await getKader(team.fussballdeTeamId, team.fussballdeSlug, saison);
    const players = kader.map((p) => p.name).filter(Boolean);
    return NextResponse.json({ players });
  } catch {
    // Scraping failed — return empty list gracefully (player picker falls back to text input)
    return NextResponse.json({ players: [] });
  }
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd /Users/johan/kickpact && npx tsc --noEmit 2>&1 | grep -i "api/squad"
```

Expected: no errors.

- [ ] **Step 3: Test route manually (needs running dev server)**

```bash
# In one terminal:
cd /Users/johan/kickpact && npm run dev

# In another:
curl "http://localhost:3000/api/squad?invitationToken=SOME_REAL_TOKEN_FROM_DB" | jq .
```

Expected: `{ "players": ["Schmidt", "Müller", ...] }` or `{ "players": [] }` if no token.

Get a real token:
```bash
cd /Users/johan/kickpact && npx dotenv -e .env.local -- npx tsx -e "
import { db } from './lib/db/client';
import { invitations } from './lib/db/schema';
import { sql } from 'drizzle-orm';
db.select({ token: invitations.token }).from(invitations).limit(3).then(r => { console.log(r); process.exit(0); });
"
```

- [ ] **Step 4: Commit**

```bash
git add app/api/squad/route.ts
git commit -m "feat: add /api/squad route — returns player list from fussball.de Kader by invitationToken"
```

---

## Task 6: Investigate and Fix Desktop Form Submission Error

**Files:**
- Modify: `app/(sponsor)/sponsor/pledge/new/_components/pledge-builder.tsx` (if fix needed there)
- Modify: `app/(sponsor)/sponsor/pledge/new/_actions/create-pledge.ts` (if fix needed there)

The user reported a form submission error on desktop only. Since the exact error is unknown, we must reproduce and diagnose it systematically before fixing anything.

- [ ] **Step 1: Run dev server and reproduce**

```bash
cd /Users/johan/kickpact && npm run dev
```

Navigate to: `http://localhost:3000/sponsor/pledge/new?invitation=TOKEN`

(Get a valid token from the DB as in Task 5 Step 3.)

On a desktop browser (≥1024px viewport), attempt to submit the pledge form:
1. Select ≥1 event
2. Fill in an amount
3. Click "Sponsoring aktivieren"

Record the exact error shown.

- [ ] **Step 2: Check browser console and Next.js server logs simultaneously**

The error might be:
- **"Sponsor-Profil fehlt"** → create-pledge.ts throws if no `sponsors` row for the user. Fix: ensure sponsor onboarding ran, or allow pledge creation without a sponsor profile (check if this path is valid).
- **"Einladung nicht gefunden"** → invitation token expired/invalid.
- **Zod validation error** → form data didn't pass schema (check that all required fields have values).
- **Network / server action serialization error** → unusual on desktop but check for large `params` objects.

- [ ] **Step 3: If error is "Sponsor-Profil fehlt"** — Create a sponsor profile upsert in the action

In `create-pledge.ts`, replace the hard throw with an auto-create:

```typescript
// OLD:
if (!sponsor) {
  throw new Error("Sponsor-Profil fehlt. Bitte erst Sponsor-Onboarding abschließen.");
}

// NEW:
let sponsorId: string;
if (!sponsor) {
  // Auto-create minimal sponsor profile — user can complete it later
  const [created] = await db
    .insert(sponsors)
    .values({ userId: user.id, displayName: user.email ?? "Sponsor" })
    .returning({ id: sponsors.id });
  sponsorId = created.id;
} else {
  sponsorId = sponsor.id;
}
```

Then replace all uses of `sponsor.id` in the function with `sponsorId`.

**Note:** Only apply Step 3 if that is actually the root cause found in Step 1. This step is conditional.

- [ ] **Step 4: Verify fix**

Reproduce the submission with the fix in place. Confirm the toast shows "Sponsoring ist live 🎉" and the user is redirected to `/sponsor/pledge/[id]`.

- [ ] **Step 5: Commit (only if a fix was applied)**

```bash
git add "app/(sponsor)/sponsor/pledge/new/_actions/create-pledge.ts"
git commit -m "fix: auto-create sponsor profile on pledge creation if not yet onboarded"
```

---

## Task 7: End-to-End Playwright Tests

**Files:**
- Create: `tests/e2e/pledge-wizard.spec.ts`

These tests verify the complete sponsor pledge flow using the wizard and confirm no 404 on the "Wetten" tab.

- [ ] **Step 1: Check existing Playwright setup**

```bash
ls /Users/johan/kickpact/tests/e2e/ 2>/dev/null || echo "no e2e dir"
cat /Users/johan/kickpact/playwright.config.ts 2>/dev/null | head -30 || echo "no playwright config"
```

If no Playwright config exists:
```bash
cd /Users/johan/kickpact && npx playwright install --with-deps chromium 2>&1 | tail -5
```

Then create `playwright.config.ts`:
```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120000,
  },
});
```

- [ ] **Step 2: Write the E2E test file**

```typescript
// tests/e2e/pledge-wizard.spec.ts
import { test, expect } from "@playwright/test";

/**
 * These tests assume:
 * - A test user can log in with TEST_EMAIL / TEST_PASSWORD from .env.local
 * - A valid invitation token exists in DB (set as PLAYWRIGHT_INVITATION_TOKEN in .env.local)
 *
 * If no .env.local vars exist, tests are skipped gracefully.
 */

const BASE = "http://localhost:3000";
const EMAIL = process.env.TEST_EMAIL ?? "";
const PASSWORD = process.env.TEST_PASSWORD ?? "";
const TOKEN = process.env.PLAYWRIGHT_INVITATION_TOKEN ?? "";

test.describe("Sponsor Pledge Wizard", () => {
  test.skip(!EMAIL || !PASSWORD, "TEST_EMAIL and TEST_PASSWORD not set in .env.local");

  test.beforeEach(async ({ page }) => {
    // Login via the app's auth flow
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(`${BASE}/sponsor`, { timeout: 10000 });
  });

  test("Wetten nav tab loads /sponsor/pledge without 404", async ({ page }) => {
    await page.goto(`${BASE}/sponsor`);
    await page.click('a[href="/sponsor/pledge"]');
    await expect(page).toHaveURL(/\/sponsor\/pledge$/);
    await expect(page.locator("h1")).toContainText("Wetten");
    // No 404 text
    await expect(page.locator("body")).not.toContainText("404");
    await expect(page.locator("body")).not.toContainText("This page could not be found");
  });

  test.skip(!TOKEN, "PLAYWRIGHT_INVITATION_TOKEN not set");

  test("Wizard step 1: selects events and advances to step 2", async ({ page }) => {
    await page.goto(`${BASE}/sponsor/pledge/new?invitation=${TOKEN}`);
    await expect(page.locator("h2")).toContainText("Ereignisse");

    // By default goal_total and win are selected — "Weiter" should be enabled
    const weiterBtn = page.locator('button:has-text("Weiter: Beträge")');
    await expect(weiterBtn).toBeEnabled();
    await weiterBtn.click();

    // Should advance to step 2
    await expect(page.locator("h2")).toContainText("Beträge");
  });

  test("Wizard step 2: shows amount fields for selected events", async ({ page }) => {
    await page.goto(`${BASE}/sponsor/pledge/new?invitation=${TOKEN}`);
    await page.click('button:has-text("Weiter: Beträge")');
    await expect(page.locator("h2")).toContainText("Beträge");

    // Amount inputs visible for the default 2 selected events
    const amountInputs = page.locator('input[type="number"]');
    expect(await amountInputs.count()).toBeGreaterThanOrEqual(2);
  });

  test("Wizard step 2: back button returns to step 1", async ({ page }) => {
    await page.goto(`${BASE}/sponsor/pledge/new?invitation=${TOKEN}`);
    await page.click('button:has-text("Weiter: Beträge")');
    await page.click('button:has-text("← Ereignisse")');
    await expect(page.locator("h2")).toContainText("Ereignisse");
  });

  test("Wizard step 3: shows summary and activate button", async ({ page }) => {
    await page.goto(`${BASE}/sponsor/pledge/new?invitation=${TOKEN}`);
    await page.click('button:has-text("Weiter: Beträge")');
    await page.click('button:has-text("Weiter: Zusammenfassung")');
    await expect(page.locator("h2")).toContainText("Alles klar");
    await expect(page.locator('button[type="submit"]')).toContainText("Sponsoring aktivieren");
  });

  test("goal_by_player event: player picker loads on step 2", async ({ page }) => {
    await page.goto(`${BASE}/sponsor/pledge/new?invitation=${TOKEN}`);

    // Toggle goal_by_player (find by label text)
    await page.click('button:has-text("Tore von Spieler X")');
    await page.click('button:has-text("Weiter: Beträge")');

    // Either a <select> with players or an <input> fallback should appear
    const hasSelect = await page.locator('select').count() > 0;
    const hasInput = await page.locator('input[placeholder="z.B. Schmidt"]').count() > 0;
    expect(hasSelect || hasInput).toBeTruthy();
  });
});
```

- [ ] **Step 3: Add env vars note to README / CLAUDE.md**

In `.env.local.example` (or `CLAUDE.md`), document the new vars:

```
# Playwright E2E tests
TEST_EMAIL=test@example.com
TEST_PASSWORD=yourpassword
PLAYWRIGHT_INVITATION_TOKEN=abc123
```

- [ ] **Step 4: Run the E2E tests (skips gracefully if env not set)**

```bash
cd /Users/johan/kickpact && npx playwright test tests/e2e/pledge-wizard.spec.ts --reporter=line 2>&1
```

Expected: tests run or skip gracefully. No unexpected failures.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/pledge-wizard.spec.ts playwright.config.ts 2>/dev/null
git commit -m "test: add E2E Playwright tests for pledge wizard flow"
```

---

## Spec Coverage Check

| Requirement | Task |
|-------------|------|
| Fix 404 `/sponsor/pledge` | Task 1 |
| "Wetten" tab shows existing pledges | Task 1 |
| Remove "Aufbauen" term | Task 2 |
| Remove "Trigger" term → "Ereignisse" | Task 2 |
| Multi-step wizard: Schritt 1 = Ereignisse wählen | Task 3 |
| Multi-step wizard: Schritt 2 = Beträge festlegen | Task 3 |
| Wizard: Schritt 3 = Zusammenfassung + Aktivieren | Task 3 |
| "Tore von Spieler X": player picker from Kader | Tasks 3+4+5 |
| Kader scraped from fussball.de | Task 4 |
| `/api/squad` resolves invitationToken → players | Task 5 |
| Fix desktop form submission error | Task 6 |
| Post-onboarding pledge editing via "Wetten" tab | Task 1 (list links to `[id]` detail pages) |
| E2E Playwright tests | Task 7 |

**No gaps found.** All requirements from the voice note are covered.
