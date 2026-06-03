"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { setTeamDiscoverable } from "@/lib/actions/sponsor-inquiries";

interface Team {
  id: string;
  name: string;
  discoverable: boolean;
  publicTagline: string;
}

export function DiscoverabilityPanel({ teams }: { teams: Team[] }) {
  return (
    <section>
      <h2 className="font-display font-bold text-xl md:text-2xl tracking-tight text-brand-night-navy">
        Öffentliche Sichtbarkeit
      </h2>
      <p className="mt-1 text-sm text-brand-night-navy/60">
        Sollen eure Mannschaften in der KickPact-Sponsor-Suche erscheinen? Sponsoren können
        euch dann direkt anfragen.
      </p>
      <ul className="mt-3 md:mt-4 space-y-3">
        {teams.map((t) => (
          <TeamRow key={t.id} team={t} />
        ))}
      </ul>
    </section>
  );
}

function TeamRow({ team }: { team: Team }) {
  const [discoverable, setDiscoverable] = useState(team.discoverable);
  const [tagline, setTagline] = useState(team.publicTagline);
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  async function save(nextDiscoverable: boolean, nextTagline: string) {
    startTransition(async () => {
      try {
        await setTeamDiscoverable({
          teamId: team.id,
          discoverable: nextDiscoverable,
          publicTagline: nextTagline || undefined
        });
        toast.success(nextDiscoverable ? "Mannschaft ist jetzt öffentlich sichtbar." : "Mannschaft wieder versteckt.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler beim Speichern");
        setDiscoverable(team.discoverable); // revert
      }
    });
  }

  async function handleToggle() {
    const next = !discoverable;
    setDiscoverable(next);
    await save(next, tagline);
  }

  async function handleSaveTagline() {
    await save(discoverable, tagline);
    setEditing(false);
  }

  return (
    <li className="rounded-xl bg-white shadow-ios-card p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-semibold text-sm md:text-base text-brand-night-navy">{team.name}</div>
          {!editing && (
            <p className="mt-1 text-xs md:text-sm text-brand-night-navy/60 italic">
              {tagline || <span className="opacity-60">Noch keine Beschreibung — klick auf Bearbeiten</span>}
            </p>
          )}
          {editing && (
            <div className="mt-2 space-y-2">
              <textarea
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="Kurze Beschreibung für das Discover-Profil (max 280 Zeichen)"
                rows={2}
                maxLength={280}
                className="w-full rounded-lg bg-white shadow-ios-card px-3 py-2 text-sm text-brand-night-navy focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="accent" disabled={isPending} onClick={handleSaveTagline}>
                  {isPending ? "Speichere…" : "Speichern"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setTagline(team.publicTagline);
                  }}
                >
                  Abbrechen
                </Button>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={discoverable}
              onChange={handleToggle}
              disabled={isPending}
              className="h-4 w-4 rounded border-brand-neutral text-accent focus:ring-accent"
            />
            <span className="text-xs md:text-sm font-medium text-brand-night-navy">
              {discoverable ? "öffentlich" : "versteckt"}
            </span>
          </label>
          {!editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-accent-dark underline"
            >
              Bearbeiten
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
