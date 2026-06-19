"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { getMannschaftenAction } from "@/app/(onboarding)/onboarding/verein/_actions/search";
import { createTeamForExistingClub } from "@/lib/actions/team-lifecycle";
import { saisonLabel } from "@/lib/utils/saison";

type Mannschaft = {
  name: string;
  slug: string;
  saison: string;
  teamId: string;
  url: string;
};

interface Props {
  clubSlug: string;
  clubName: string;
  fussballdeVereinId: string;
  hasVereinPlan: boolean;
  existingFussballdeTeamIds: string[];
}

type Plan = "basic" | "pro" | "verein";

export function NeuesTeamWizard({
  clubSlug,
  clubName,
  fussballdeVereinId,
  hasVereinPlan,
  existingFussballdeTeamIds
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [teams, setTeams] = useState<Mannschaft[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan>(hasVereinPlan ? "verein" : "basic");
  const [pending, startTransition] = useTransition();

  const existingSet = new Set(existingFussballdeTeamIds);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setTeamsLoading(true);
      const res = await getMannschaftenAction({
        vereinId: fussballdeVereinId,
        slug: clubSlug,
        vereinName: clubName
      });
      if (cancelled) return;
      setTeamsLoading(false);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setTeams(res.results);
    })();
    return () => {
      cancelled = true;
    };
  }, [fussballdeVereinId, clubSlug, clubName]);

  const selectedTeam = teams.find((t) => t.teamId === selectedTeamId) ?? null;

  function handleContinue() {
    if (!selectedTeam) {
      toast.error("Bitte eine Mannschaft auswählen");
      return;
    }
    if (existingSet.has(selectedTeam.teamId)) {
      toast.error("Diese Mannschaft existiert bereits in KickPact.");
      return;
    }
    setStep(2);
  }

  function handleSubmit() {
    if (!selectedTeam) return;
    startTransition(async () => {
      try {
        const result = await createTeamForExistingClub({
          clubSlug,
          team: {
            teamId: selectedTeam.teamId,
            teamSlug: selectedTeam.slug,
            teamName: selectedTeam.name,
            saison: selectedTeam.saison
          },
          plan
        });
        toast.success("Mannschaft hinzugefügt.");
        router.push(`/verein/${clubSlug}/mannschaft/${result.teamId}`);
      } catch (e) {
        const msg =
          e instanceof Error
            ? e.message
            : "Mannschaft konnte nicht hinzugefügt werden.";
        toast.error(msg);
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Step Indicator */}
      <div className="flex items-center gap-2">
        <StepBadge active={step === 1} done={step > 1} label="1. Mannschaft" />
        <div className="h-px flex-1 bg-brand-neutral/40" />
        <StepBadge active={step === 2} done={false} label="2. Plan" />
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-semibold text-brand-night-navy">
              Welche Mannschaft willst du hinzufügen?
            </Label>
            <p className="mt-1 text-xs text-brand-night-navy/60">
              Wir holen alle Mannschaften deines Vereins von fußball.de —
              bereits vorhandene sind ausgegraut.
            </p>
          </div>

          {teamsLoading ? (
            <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-4 text-sm text-brand-night-navy/60 animate-pulse">
              Lade Mannschaften…
            </div>
          ) : teams.length === 0 ? (
            <div className="rounded-lg bg-white shadow-ios-card p-4 text-sm text-brand-night-navy/60">
              Keine Mannschaften auf fußball.de gefunden.
            </div>
          ) : (
            <ul className="space-y-2">
              {teams.map((t) => {
                const alreadyExists = existingSet.has(t.teamId);
                const checked = selectedTeamId === t.teamId;
                return (
                  <li key={t.teamId}>
                    <label
                      className={
                        "flex items-center gap-3 rounded-lg border bg-white p-4 transition-colors " +
                        (alreadyExists
                          ? "border-brand-neutral/30 opacity-50 cursor-not-allowed"
                          : checked
                            ? "border-accent bg-accent/5 cursor-pointer"
                            : "border-brand-neutral/40 hover:border-accent/40 cursor-pointer")
                      }
                    >
                      <input
                        type="radio"
                        name="team"
                        disabled={alreadyExists}
                        checked={checked}
                        onChange={() => setSelectedTeamId(t.teamId)}
                        className="h-4 w-4 accent-accent"
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-brand-night-navy">
                          {t.name}
                        </div>
                        <div className="text-xs text-brand-night-navy/60 mt-0.5">
                          Saison {saisonLabel(t.saison)}
                          {alreadyExists && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-brand-neutral/40 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest text-brand-night-navy/60">
                              Bereits vorhanden
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex justify-end pt-2">
            <Button
              variant="accent"
              size="lg"
              onClick={handleContinue}
              disabled={!selectedTeam}
            >
              Weiter →
            </Button>
          </div>
        </div>
      )}

      {step === 2 && selectedTeam && (
        <div className="space-y-6">
          <div className="rounded-lg border border-accent/40 bg-accent/5 p-4">
            <div className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
              Ausgewählte Mannschaft
            </div>
            <div className="mt-1 font-display font-bold text-xl tracking-tight text-brand-night-navy">
              {selectedTeam.name}
            </div>
            <div className="text-xs text-brand-night-navy/60 mt-0.5">
              Saison {saisonLabel(selectedTeam.saison)}
            </div>
          </div>

          <div>
            <Label className="text-sm font-semibold text-brand-night-navy">
              Saison
            </Label>
            <p className="mt-1 text-xs text-brand-night-navy/60">
              Aus den fußball.de-Daten übernommen.
            </p>
            <div className="mt-2 rounded-md border border-brand-neutral/40 bg-brand-off-white px-3 py-2 text-sm text-brand-night-navy">
              {saisonLabel(selectedTeam.saison)}
            </div>
          </div>

          {hasVereinPlan ? (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
              <strong>Vereinslizenz aktiv</strong> — diese Mannschaft wird
              automatisch in deine bestehende Vereinslizenz aufgenommen, ohne
              Zusatzkosten.
            </div>
          ) : (
            <div>
              <Label className="text-sm font-semibold text-brand-night-navy">
                Plan für diese Mannschaft
              </Label>
              <p className="mt-1 text-xs text-brand-night-navy/60">
                Du kannst den Plan später jederzeit ändern.
              </p>
              <Select
                value={plan}
                onValueChange={(v) => setPlan(v as Plan)}
              >
                <SelectTrigger className="mt-2 w-full">
                  <SelectValue placeholder="Plan wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic — 5 €/Monat</SelectItem>
                  <SelectItem value="pro">Pro — 11 €/Monat</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <Button
              variant="ghost"
              size="lg"
              onClick={() => setStep(1)}
              disabled={pending}
            >
              ← Zurück
            </Button>
            <Button
              variant="accent"
              size="lg"
              onClick={handleSubmit}
              disabled={pending}
            >
              {pending ? "Lege Mannschaft an…" : "Mannschaft hinzufügen"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StepBadge({
  active,
  done,
  label
}: {
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <div
      className={
        "rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap " +
        (active
          ? "bg-accent text-white"
          : done
            ? "bg-emerald-100 text-emerald-800"
            : "bg-brand-neutral/30 text-brand-night-navy/60")
      }
    >
      {label}
    </div>
  );
}
