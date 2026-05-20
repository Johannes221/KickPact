"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createSponsorInquiry } from "@/lib/actions/sponsor-inquiries";
import type { DiscoverableTeam } from "@/lib/db/queries/sponsor-discover";

export function DiscoverList({ teams }: { teams: DiscoverableTeam[] }) {
  if (teams.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-6 md:p-8 text-center">
        <div className="text-3xl mb-2">🔍</div>
        <p className="font-display font-black text-base md:text-lg text-brand-night-navy">
          Keine passenden Mannschaften gefunden
        </p>
        <p className="mt-1.5 text-sm text-brand-night-navy/60">
          Versuch eine andere Suche — oder warte, bis mehr Mannschaften ihr Profil öffentlich
          machen.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-3 md:gap-4 sm:grid-cols-2">
      {teams.map((t) => (
        <TeamCard key={t.teamId} team={t} />
      ))}
    </ul>
  );
}

function TeamCard({ team }: { team: DiscoverableTeam }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(team.hasOpenInquiry);

  async function handleSubmit() {
    setPending(true);
    try {
      await createSponsorInquiry({ teamId: team.teamId, message: message || undefined });
      setDone(true);
      setOpen(false);
      toast.success("Anfrage versendet!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Anfrage fehlgeschlagen");
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="rounded-2xl border border-brand-neutral/40 bg-white p-4 md:p-5">
      <div className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
        {team.teamName}
      </div>
      <div className="mt-0.5 text-xs md:text-sm text-brand-night-navy/60">
        {team.clubName}
        {team.clubOrt && <span> · {team.clubOrt}</span>}
        <span> · Saison {team.saison}</span>
      </div>
      {team.publicTagline && (
        <p className="mt-2 text-xs md:text-sm text-brand-night-navy/80 italic">
          „{team.publicTagline}"
        </p>
      )}
      <div className="mt-3 md:mt-4">
        {done ? (
          <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-1 text-xs font-semibold">
            ✓ Anfrage gesendet
          </span>
        ) : open ? (
          <div className="space-y-2">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Optional: kurze Nachricht — wer du bist, warum du unterstützen willst…"
              rows={3}
              maxLength={500}
              className="w-full rounded-lg border border-brand-neutral/40 bg-white px-3 py-2 text-sm text-brand-night-navy focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            <div className="flex gap-2">
              <Button size="sm" variant="accent" disabled={pending} onClick={handleSubmit}>
                {pending ? "Sende…" : "Anfrage absenden"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Abbrechen
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="accent" onClick={() => setOpen(true)}>
            Sponsoring anfragen →
          </Button>
        )}
      </div>
    </li>
  );
}
