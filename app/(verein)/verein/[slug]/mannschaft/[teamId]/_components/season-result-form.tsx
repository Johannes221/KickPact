"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { setSeasonResult } from "@/lib/actions/season-results";
import { CUP_ROUND_ORDER, CUP_ROUND_LABELS } from "@/lib/triggers/cup-rounds";
import { saisonLabel } from "@/lib/utils/saison";

interface Current {
  finalPosition: number | null;
  teamsInLeague: number | null;
  promoted: boolean;
  relegated: boolean;
  cupRoundReached: string | null;
  customNotes: string | null;
}

export function SeasonResultForm({
  teamId,
  saison,
  current
}: {
  teamId: string;
  saison: string;
  current: Current | null;
}) {
  const [expanded, setExpanded] = useState(!current);
  const [finalPosition, setFinalPosition] = useState(
    current?.finalPosition?.toString() ?? ""
  );
  const [teamsInLeague, setTeamsInLeague] = useState(
    current?.teamsInLeague?.toString() ?? ""
  );
  const [promoted, setPromoted] = useState(current?.promoted ?? false);
  const [relegated, setRelegated] = useState(current?.relegated ?? false);
  const [cupRoundReached, setCupRoundReached] = useState(current?.cupRoundReached ?? "");
  const [customNotes, setCustomNotes] = useState(current?.customNotes ?? "");
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      try {
        await setSeasonResult({
          teamId,
          saison,
          finalPosition: finalPosition ? Number(finalPosition) : undefined,
          teamsInLeague: teamsInLeague ? Number(teamsInLeague) : undefined,
          promoted,
          relegated,
          cupRoundReached: cupRoundReached || undefined,
          customNotes: customNotes || undefined
        });
        toast.success("Saison-Ergebnis gespeichert. Saison-Regeln werden ausgewertet.");
        setExpanded(false);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
      }
    });
  }

  if (!expanded && current) {
    return (
      <section className="rounded-2xl bg-white shadow-ios-card p-4 md:p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-display font-bold text-base md:text-lg tracking-tight text-brand-night-navy">
              Saison-Ergebnis {saisonLabel(saison)}
            </h3>
            <div className="mt-2 text-xs md:text-sm text-brand-night-navy/70 space-y-0.5">
              {current.finalPosition && (
                <div>
                  📊 Endplatz: <strong>{current.finalPosition}</strong>
                  {current.teamsInLeague && ` von ${current.teamsInLeague}`}
                </div>
              )}
              {current.promoted && <div>⬆️ Aufstieg geschafft</div>}
              {current.relegated && <div>⬇️ Abgestiegen</div>}
              {current.cupRoundReached && <div>🏆 Pokal: {current.cupRoundReached}</div>}
              {current.customNotes && <div>📝 {current.customNotes}</div>}
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => setExpanded(true)}>
            Bearbeiten
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-accent/30 bg-accent/5 p-4 md:p-5">
      <h3 className="font-display font-bold text-base md:text-lg tracking-tight text-brand-night-navy">
        Saison-Ergebnis eintragen
      </h3>
      <p className="mt-1 text-xs md:text-sm text-brand-night-navy/70">
        Trage den End-Stand ein, sobald die Saison gewertet ist. Saison-Regeln der Sponsoren
        werden danach automatisch abgerechnet.
      </p>

      <div className="mt-4 grid gap-3 md:gap-4 sm:grid-cols-2">
        <NumberField
          label="End-Tabellenplatz"
          value={finalPosition}
          onChange={setFinalPosition}
          placeholder="z.B. 3"
        />
        <NumberField
          label="Teams in der Liga"
          value={teamsInLeague}
          onChange={setTeamsInLeague}
          placeholder="z.B. 16"
        />
        <CheckField
          label="Aufstieg geschafft"
          checked={promoted}
          onChange={setPromoted}
        />
        <CheckField
          label="Abgestiegen"
          checked={relegated}
          onChange={setRelegated}
        />
      </div>

      <div className="mt-3 md:mt-4">
        <label className="block">
          <span className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
            Pokal-Runde erreicht (optional)
          </span>
          <select
            value={cupRoundReached}
            onChange={(e) => setCupRoundReached(e.target.value)}
            className="mt-1.5 w-full rounded-lg bg-white shadow-ios-card px-3 py-2 text-sm text-brand-night-navy focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          >
            <option value="">— keiner —</option>
            {CUP_ROUND_ORDER.map((r) => (
              <option key={r} value={r}>
                {CUP_ROUND_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 md:mt-4">
        <label className="block">
          <span className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
            Notizen für eigene Saison-Ziele (optional)
          </span>
          <textarea
            value={customNotes}
            onChange={(e) => setCustomNotes(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder='z.B. "Mehr als 60 Tore", "Kein Spiel verloren"'
            className="mt-1.5 w-full rounded-lg bg-white shadow-ios-card px-3 py-2 text-sm text-brand-night-navy focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </label>
        <p className="mt-1 text-[0.7rem] text-brand-night-navy/50">
          Sponsoren mit eigenem Saison-Ziel bestätigen das Erreichen selbst.
        </p>
      </div>

      <div className="mt-4 md:mt-5 flex flex-wrap gap-2">
        <Button size="sm" variant="accent" disabled={isPending} onClick={handleSubmit}>
          {isPending ? "Speichere…" : "Speichern + Saison-Regeln auswerten"}
        </Button>
        {current && (
          <Button size="sm" variant="ghost" onClick={() => setExpanded(false)}>
            Abbrechen
          </Button>
        )}
      </div>
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
        {label}
      </span>
      <input
        type="number"
        min={1}
        max={40}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-lg bg-white shadow-ios-card px-3 py-2 text-sm text-brand-night-navy focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
    </label>
  );
}

function CheckField({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer rounded-lg bg-white shadow-ios-card px-3 py-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-brand-neutral text-accent focus:ring-accent"
      />
      <span className="text-sm text-brand-night-navy">{label}</span>
    </label>
  );
}
