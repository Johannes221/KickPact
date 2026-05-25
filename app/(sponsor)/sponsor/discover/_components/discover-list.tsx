"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DashboardTile } from "@/components/shared/dashboard-tile";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { createSponsorInquiry } from "@/lib/actions/sponsor-inquiries";
import type { DiscoverableTeam } from "@/lib/db/queries/sponsor-discover";

export function DiscoverList({ teams }: { teams: DiscoverableTeam[] }) {
  if (teams.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-6 md:p-8 text-center">
        <div className="text-3xl mb-2">🔍</div>
        <p className="font-display font-black text-base md:text-lg text-brand-night-navy">
          Noch keine entdeckbaren Mannschaften
        </p>
        <p className="mt-1.5 text-sm text-brand-night-navy/60">
          Versuch eine andere Suche — oder warte, bis mehr Mannschaften ihr Profil öffentlich
          machen.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:gap-4 md:grid-cols-2">
      {teams.map((t) => (
        <TeamTile key={t.teamId} team={t} />
      ))}
    </div>
  );
}

function TeamTile({ team }: { team: DiscoverableTeam }) {
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

  const title = `${team.clubName} · ${team.teamName}`;
  const primary = `Saison ${team.saison}`;
  const secondaryParts: string[] = [];
  if (team.clubOrt) secondaryParts.push(team.clubOrt);
  if (team.publicTagline) secondaryParts.push(`„${team.publicTagline}"`);
  const secondary = secondaryParts.join(" · ") || undefined;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-left w-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
        aria-label={`Sponsoring anfragen: ${title}`}
      >
        <DashboardTile
          icon="⚽"
          title={title}
          primary={primary}
          secondary={secondary}
        >
          <div className="flex flex-wrap items-center gap-2">
            {!team.clubVerifiedAt && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest text-amber-800">
                Nicht verifiziert
              </span>
            )}
            {done ? (
              <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-1 text-xs font-semibold">
                ✓ Anfrage gesendet
              </span>
            ) : (
              <span className="inline-flex items-center text-xs font-semibold text-accent">
                Sponsoring anfragen →
              </span>
            )}
          </div>
        </DashboardTile>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[90%] sm:max-w-md bg-white">
          <SheetHeader>
            <SheetTitle className="text-left">
              <span className="block text-[0.65rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
                Sponsoring anfragen
              </span>
              <span className="block font-display font-black text-xl tracking-tight text-brand-night-navy">
                {title}
              </span>
            </SheetTitle>
            <SheetDescription className="text-left text-sm text-brand-night-navy/60">
              Saison {team.saison}
              {team.clubOrt ? ` · ${team.clubOrt}` : ""}
            </SheetDescription>
          </SheetHeader>

          {team.publicTagline && (
            <p className="mt-4 text-sm text-brand-night-navy/80 italic">
              „{team.publicTagline}"
            </p>
          )}

          {done ? (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              ✓ Deine Anfrage wurde versendet. Die Mannschaft meldet sich per Mail.
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {!team.clubVerifiedAt && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  Dieser Verein ist noch nicht verifiziert. Pledges sind möglich, aber wir
                  senden dir erst eine Rechnung, sobald KickPact die Vereinsvertretung
                  bestätigt hat.
                </div>
              )}
              <label className="block">
                <span className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
                  Nachricht (optional)
                </span>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Wer du bist, warum du unterstützen willst…"
                  rows={4}
                  maxLength={500}
                  className="mt-1.5 w-full rounded-lg border border-brand-neutral/40 bg-white px-3 py-2 text-sm text-brand-night-navy focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
              </label>
              <div className="flex gap-2">
                <Button variant="accent" disabled={pending} onClick={handleSubmit}>
                  {pending ? "Sende…" : "Anfrage absenden"}
                </Button>
                <Button variant="ghost" onClick={() => setOpen(false)}>
                  Abbrechen
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
