"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { getMannschaftenAction } from "../_actions/search";
import { toast } from "sonner";

type Mannschaft = {
  name: string;
  slug: string;
  saison: string;
  teamId: string;
  url: string;
};

export function TeamPlanStep() {
  const router = useRouter();
  const params = useSearchParams();
  const vereinId = params.get("vereinId");
  const slug = params.get("slug");
  const vereinName = params.get("name");

  const [teams, setTeams] = useState<Mannschaft[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedPlan, setSelectedPlan] = useState<"basic" | "pro">("basic");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!vereinId || !slug) {
      setLoading(false);
      return;
    }
    (async () => {
      const res = await getMannschaftenAction({ vereinId, slug });
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
  }, [vereinId, slug]);

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
      plan: selectedPlan
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
            Lade Mannschaften aus Fußball.de…
          </div>
        ) : teams.length === 0 ? (
          <div className="rounded-lg border border-brand-neutral/40 bg-white p-4 text-sm text-brand-night-navy/60">
            Keine Mannschaften gefunden.
          </div>
        ) : (
          <RadioGroup value={selectedTeamId} onValueChange={setSelectedTeamId} className="space-y-2">
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
                    <div className="font-semibold text-brand-night-navy">{t.name}</div>
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

      {/* Plan-Wahl */}
      <div className="space-y-4">
        <Label className="text-sm font-semibold text-brand-night-navy">
          Welcher Plan für diese Mannschaft?
        </Label>
        <RadioGroup
          value={selectedPlan}
          onValueChange={(v) => setSelectedPlan(v as "basic" | "pro")}
          className="grid gap-4 md:grid-cols-2"
        >
          <PlanCard plan="basic" price="9 €" selected={selectedPlan === "basic"} />
          <PlanCard plan="pro" price="19 €" selected={selectedPlan === "pro"} />
        </RadioGroup>
        <p className="text-xs text-brand-night-navy/50">
          30 Tage gratis. Pro Mannschaft buchbar — weitere Mannschaften kannst du später aktivieren.
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
        <Button variant="accent" onClick={handleNext} disabled={pending || !selectedTeamId} size="lg">
          Weiter →
        </Button>
      </div>
    </div>
  );
}

function PlanCard({
  plan,
  price,
  selected
}: {
  plan: "basic" | "pro";
  price: string;
  selected: boolean;
}) {
  const features =
    plan === "basic"
      ? ["20 Sponsoren pro Mannschaft", "Alle Auto- & Manuelle-Trigger", "Monatliches PDF"]
      : ["Unlimited Sponsoren", "Vereins-Logo auf PDF", "CSV-Export, Custom-Trigger"];
  return (
    <Label
      htmlFor={`plan-${plan}`}
      className={
        "block rounded-2xl border p-5 cursor-pointer transition-colors " +
        (selected ? "border-accent bg-accent/5" : "border-brand-neutral/40 bg-white hover:border-accent/40")
      }
    >
      <div className="flex items-center gap-3">
        <RadioGroupItem value={plan} id={`plan-${plan}`} />
        <div className="flex flex-1 items-baseline justify-between">
          <span className="font-display font-black text-xl tracking-tight uppercase text-brand-night-navy">
            {plan === "basic" ? "Basic" : "Pro"}
          </span>
          <span className="font-mono text-sm text-brand-night-navy/70">{price} / Mon.</span>
        </div>
      </div>
      <ul className="mt-4 space-y-1.5 text-xs text-brand-night-navy/70 pl-7">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <span className="text-accent">·</span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </Label>
  );
}
