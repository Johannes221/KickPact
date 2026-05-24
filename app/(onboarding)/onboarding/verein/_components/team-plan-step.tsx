"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, ShieldCheck, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { getMannschaftenAction } from "../_actions/search";
import { toast } from "sonner";
import {
  PLANS,
  PLAN_ORDER,
  CYCLE_LABELS,
  CYCLE_ORDER,
  type BillingCycle,
  type PlanKey
} from "@/lib/stripe/pricing";

type Mannschaft = {
  name: string;
  slug: string;
  saison: string;
  teamId: string;
  url: string;
};

interface Props {
  seasonOpen: boolean;
  seasonCode: string | null;
  matchdayFiveAtIso: string | null;
}

function defaultCycle(seasonOpen: boolean, month: number): BillingCycle {
  // pricing.md §6 Mid-Season:
  //   Juni → season (Frühbucher)
  //   Juli–Sep bis MD5 → season
  //   ab MD5+1 → monthly
  if (seasonOpen) return "season";
  if (month === 6 || month === 7) return "season";
  return "monthly";
}

export function TeamPlanStep({
  seasonOpen,
  seasonCode,
  matchdayFiveAtIso
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const vereinId = params.get("vereinId");
  const slug = params.get("slug");
  const vereinName = params.get("name");

  const [teams, setTeams] = useState<Mannschaft[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedPlan, setSelectedPlan] = useState<PlanKey>("basic");
  const [selectedCycle, setSelectedCycle] = useState<BillingCycle>(
    defaultCycle(seasonOpen, new Date().getMonth() + 1)
  );
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!vereinId || !slug) {
      setLoading(false);
      return;
    }
    (async () => {
      const res = await getMannschaftenAction({
        vereinId,
        slug,
        vereinName: vereinName ?? undefined
      });
      setLoading(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setTeams(res.results);
      if (res.results.length === 0) {
        toast.info("Keine Mannschaften für diesen Verein gefunden.");
      }
    })();
  }, [vereinId, slug, vereinName]);

  const matchdayFiveDate = useMemo(
    () =>
      matchdayFiveAtIso
        ? new Date(matchdayFiveAtIso).toLocaleDateString("de-DE", {
            day: "2-digit",
            month: "long"
          })
        : null,
    [matchdayFiveAtIso]
  );

  function handleNext() {
    if (!selectedTeamId) {
      toast.error("Bitte Mannschaft auswählen");
      return;
    }
    const team = teams.find((t) => t.teamId === selectedTeamId);
    if (!team) return;
    const next = new URLSearchParams({
      vereinId: vereinId!,
      slug: slug!,
      name: vereinName!,
      teamId: team.teamId,
      teamSlug: team.slug,
      teamName: team.name,
      saison: team.saison,
      plan: selectedPlan,
      cycle: selectedCycle
    });
    startTransition(() => {
      router.push(`/onboarding/verein/3?${next.toString()}`);
    });
  }

  if (!vereinId || !slug) {
    return (
      <div className="rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-4 text-sm text-brand-alert-red">
        Kein Verein ausgewählt.{" "}
        <button
          onClick={() => router.push("/onboarding/verein/1")}
          className="font-semibold underline"
        >
          Zurück zu Schritt 1
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Verein-Header */}
      <div>
        <div className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
          Gewählter Verein
        </div>
        <div className="mt-1 font-display font-black text-2xl tracking-tight text-brand-night-navy">
          {vereinName}
        </div>
      </div>

      {/* Mannschaftswahl */}
      <div className="space-y-4">
        <Label className="text-sm font-semibold text-brand-night-navy">
          Welche Mannschaft willst du sponsoring-fähig machen?
        </Label>
        {loading ? (
          <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-4 text-sm text-brand-night-navy/60 animate-pulse">
            Lade Mannschaften…
          </div>
        ) : teams.length === 0 ? (
          <div className="rounded-lg border border-brand-neutral/40 bg-white p-4 text-sm text-brand-night-navy/60">
            Keine Mannschaften gefunden.
          </div>
        ) : (
          <RadioGroup
            value={selectedTeamId}
            onValueChange={setSelectedTeamId}
            className="space-y-2"
          >
            {teams.map((t) => {
              const isActive = selectedTeamId === t.teamId;
              return (
                <Label
                  key={t.teamId}
                  htmlFor={`team-${t.teamId}`}
                  className={
                    "flex items-center gap-3 rounded-lg border bg-white p-4 cursor-pointer transition-colors " +
                    (isActive
                      ? "border-accent bg-accent/5"
                      : "border-brand-neutral/40 hover:border-accent/40")
                  }
                >
                  <RadioGroupItem value={t.teamId} id={`team-${t.teamId}`} />
                  <div className="flex-1">
                    <div className="font-semibold text-brand-night-navy">
                      {t.name}
                    </div>
                    <div className="text-xs text-brand-night-navy/40 mt-0.5">
                      Saison {t.saison}
                    </div>
                  </div>
                </Label>
              );
            })}
          </RadioGroup>
        )}
      </div>

      {/* Trust-Banner — Trial-Versprechen prominent */}
      <div className="rounded-2xl bg-gradient-to-br from-accent/12 to-accent/5 border border-accent/30 p-5">
        <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-5 gap-y-2.5">
          <TrustItem icon={<ShieldCheck className="h-5 w-5" strokeWidth={2.5} />}>
            <strong className="font-bold">30 Tage gratis</strong> testen
          </TrustItem>
          <span
            className="hidden sm:block h-5 w-px bg-accent/30"
            aria-hidden
          />
          <TrustItem
            icon={<CreditCard className="h-5 w-5" strokeWidth={2.5} />}
            strike
          >
            Keine Kreditkarte
          </TrustItem>
          <span
            className="hidden sm:block h-5 w-px bg-accent/30"
            aria-hidden
          />
          <TrustItem icon={<Check className="h-5 w-5" strokeWidth={3} />}>
            Jederzeit kündbar
          </TrustItem>
        </div>
        <p className="mt-2.5 text-center sm:text-left text-xs text-brand-night-navy/65">
          Keine Zahlungsdaten beim Start. Erst nach 30 Tagen entscheidest du, ob
          du weitermachst.
        </p>
      </div>

      {/* Saison-Hint Banner */}
      <SeasonBanner
        seasonOpen={seasonOpen}
        seasonCode={seasonCode}
        matchdayFiveDate={matchdayFiveDate}
      />

      {/* Cycle-Toggle */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold text-brand-night-navy">
          Wie willst du zahlen?
        </Label>
        <div className="inline-flex rounded-xl border border-brand-neutral/40 bg-white p-1">
          {CYCLE_ORDER.map((c) => {
            const disabled = c === "season" && !seasonOpen;
            const active = selectedCycle === c;
            return (
              <button
                key={c}
                type="button"
                disabled={disabled}
                onClick={() => setSelectedCycle(c)}
                className={
                  "px-4 py-2 rounded-lg text-sm font-semibold transition-colors " +
                  (active
                    ? "bg-accent text-white"
                    : "text-brand-night-navy hover:bg-brand-neutral/20") +
                  (disabled ? " opacity-40 cursor-not-allowed" : "")
                }
                title={
                  disabled
                    ? `Saison-Pass wieder buchbar ab Juli ${
                        new Date().getFullYear() + 1
                      } (Cutoff am 5. Spieltag).`
                    : undefined
                }
              >
                {CYCLE_LABELS[c]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Plan-Wahl 3 Tiers */}
      <div className="space-y-4">
        <Label className="text-sm font-semibold text-brand-night-navy">
          Welcher Plan für diese Mannschaft?
        </Label>
        <RadioGroup
          value={selectedPlan}
          onValueChange={(v) => setSelectedPlan(v as PlanKey)}
          className="grid gap-4 md:grid-cols-3"
        >
          {PLAN_ORDER.map((key) => (
            <PlanCard
              key={key}
              plan={key}
              cycle={selectedCycle}
              selected={selectedPlan === key}
            />
          ))}
        </RadioGroup>
        <p className="text-xs text-brand-night-navy/50">
          30 Tage gratis · 0 % Provision · Pro Mannschaft oder Verein buchbar.
        </p>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button
          variant="ghost"
          onClick={() => router.push("/onboarding/verein/1")}
          disabled={pending}
        >
          ← Zurück
        </Button>
        <Button
          variant="accent"
          onClick={handleNext}
          disabled={pending || !selectedTeamId}
          size="lg"
        >
          Weiter →
        </Button>
      </div>
    </div>
  );
}

function SeasonBanner({
  seasonOpen,
  seasonCode,
  matchdayFiveDate
}: {
  seasonOpen: boolean;
  seasonCode: string | null;
  matchdayFiveDate: string | null;
}) {
  if (!seasonCode) return null;
  const month = new Date().getMonth() + 1;
  if (seasonOpen) {
    if (month === 6 || month === 7) {
      return (
        <div className="rounded-2xl border border-accent/40 bg-accent/5 p-3 text-sm text-brand-night-navy/80">
          <strong>Frühbucher-Phase:</strong> 30 Tage Trial, danach startet der
          Saison-Pass mit Saison-Beginn (Aug).
        </div>
      );
    }
    return (
      <div className="rounded-2xl border border-accent/40 bg-accent/5 p-3 text-sm text-brand-night-navy/80">
        <strong>Saison-Pass + Saison-Wetten</strong> sind noch buchbar bis zum 5. Spieltag
        {matchdayFiveDate ? ` (${matchdayFiveDate})` : ""}. Danach nur noch Monatsabo.
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <strong>Saison-Pass nicht mehr verfügbar</strong> für Saison {seasonCode} —
      der 5. Spieltag ist überschritten. Monatsabo bleibt verfügbar; Saison-Pass
      startet wieder zur nächsten Saison im August und spart ~2 Monate.
    </div>
  );
}

function PlanCard({
  plan,
  cycle,
  selected
}: {
  plan: PlanKey;
  cycle: BillingCycle;
  selected: boolean;
}) {
  const def = PLANS[plan];
  const price = def.cycles[cycle];
  const isPro = plan === "pro";

  // Kompakte 3-Item-Highlights pro Tier (Wizard-Fokus)
  const highlights: string[] =
    plan === "basic"
      ? [
          "Alle Auto- & Manuell-Trigger",
          "Bis 5 Sponsoren / Mannschaft",
          "Monatliche PDF-Rechnung"
        ]
      : plan === "pro"
        ? [
            "∞ Sponsoren · ∞ Pledge-Rules",
            "Saison-Wetten + Custom-Trigger",
            "Vereins-Logo auf PDF · CSV-Export"
          ]
        : [
            "∞ Mannschaften unter einer Lizenz",
            "Master-Cockpit + Sammelrechnung",
            "WhatsApp-Support, 4 h SLA"
          ];

  return (
    <Label
      htmlFor={`plan-${plan}`}
      className={cn(
        "relative flex flex-col rounded-2xl border p-5 cursor-pointer transition-all",
        selected
          ? "border-accent bg-accent/5 ring-2 ring-accent/40 shadow-lg shadow-accent/10"
          : "border-brand-neutral/40 bg-white hover:border-accent/40 hover:shadow-sm",
        isPro && !selected && "border-accent/30"
      )}
    >
      {isPro && (
        <span className="absolute -top-2.5 right-4 rounded-full bg-accent text-white text-[0.55rem] font-bold uppercase tracking-[0.18em] px-2.5 py-0.5 shadow-sm">
          Empfohlen
        </span>
      )}

      <div className="flex items-center gap-3">
        <RadioGroupItem value={plan} id={`plan-${plan}`} />
        <span className="font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
          {def.label}
        </span>
      </div>

      <div className="mt-3 pl-7 flex items-baseline gap-1.5 tabular-nums">
        <span className="font-display font-black text-3xl text-brand-night-navy leading-none">
          {price.display}
        </span>
        <span className="text-xs text-brand-night-navy/60">
          {price.caption}
        </span>
      </div>

      {price.saveBadge && (
        <span className="mt-1.5 ml-7 inline-flex w-fit rounded-full bg-accent/15 px-2 py-0.5 text-[0.55rem] font-bold uppercase tracking-wider text-accent-dark">
          {price.saveBadge}
        </span>
      )}

      {cycle === "monthly" && (
        <p className="mt-1.5 pl-7 inline-flex items-center gap-1 text-[0.7rem] font-semibold text-accent-dark">
          <Check className="h-3 w-3 shrink-0" aria-hidden />
          Jederzeit zum Monatsende kündbar
        </p>
      )}

      {def.note && cycle !== "monthly" && (
        <p className="mt-1.5 pl-7 text-[0.7rem] font-semibold text-accent-dark">
          {def.note}
        </p>
      )}

      <ul className="mt-4 space-y-1.5 text-xs text-brand-night-navy/80 pl-7">
        {highlights.map((h) => (
          <li key={h} className="flex gap-1.5">
            <Check
              className="h-3.5 w-3.5 mt-0.5 shrink-0 text-accent"
              aria-hidden
            />
            <span>{h}</span>
          </li>
        ))}
      </ul>
    </Label>
  );
}

// ---------------------------------------------------------------------------
// TrustItem — Inline-Item für den Trust-Banner (30 Tage / Keine Kreditkarte)
// ---------------------------------------------------------------------------

function TrustItem({
  icon,
  children,
  strike = false
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
  /** Roter Strich durchs Icon — Kreditkarten-Verbot-Stil. */
  strike?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2 text-brand-night-navy">
      <span
        className={cn(
          "relative inline-flex h-7 w-7 items-center justify-center rounded-full",
          strike
            ? "bg-brand-alert-red/10 text-brand-alert-red"
            : "bg-accent/15 text-accent-dark"
        )}
      >
        {icon}
        {strike && (
          <span
            className="absolute h-[2px] w-5 rotate-[-25deg] bg-brand-alert-red rounded-full"
            aria-hidden
          />
        )}
      </span>
      <span className="text-sm font-medium">{children}</span>
    </span>
  );
}
