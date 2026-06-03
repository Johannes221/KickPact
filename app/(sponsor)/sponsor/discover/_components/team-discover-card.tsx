"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { createSponsorInquiry } from "@/lib/actions/sponsor-inquiries";
import { TeamCrest } from "@/components/shared/team-crest";
import type { DiscoverableTeam } from "@/lib/db/queries/sponsor-discover";

export function TeamDiscoverCard({
  team,
  mode
}: {
  team: DiscoverableTeam;
  mode: "public" | "sponsor";
}) {
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

  const metaParts = [team.clubName, team.league, team.clubOrt].filter(Boolean);
  const meta = metaParts.join(" · ");

  const teaserParts: string[] = [];
  if (team.lastSeasonPosition != null) {
    let teaser = `Vorjahr: ${team.lastSeasonPosition}. Platz`;
    if (team.lastSeasonPromoted) teaser += " · Aufstieg";
    teaserParts.push(teaser);
  }
  const teaser = teaserParts[0] ?? null;

  const profileHref = team.publicSlug ? `/m/${team.publicSlug}` : null;

  return (
    <>
      <article className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-ios-card shadow-ios-card hover:shadow-ios-elevated transition-shadow">
        {/* Cover */}
        <div className="relative h-36 overflow-hidden bg-brand-night-navy">
          {team.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={team.coverUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-50"
            />
          ) : (
            <div
              className="absolute inset-0 opacity-[0.12]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(45deg,#01C457 0 2px,transparent 2px 20px)"
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-brand-night-navy via-brand-night-navy/40 to-transparent" />
          {/* Wappen (Logo oder Initialen-Fallback) */}
          <TeamCrest
            name={team.teamName}
            src={team.logoUrl}
            size={40}
            shape="squircle"
            className="absolute bottom-3 left-3 shadow-lg"
          />
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-1.5 px-4 py-3">
          <h3 className="font-display text-base font-bold tracking-tight text-brand-night-navy leading-tight">
            {team.teamName}
          </h3>
          {meta && (
            <p className="text-xs text-brand-night-navy/60 leading-snug">
              {meta}
              {" · "}
              <span className="font-semibold text-accent">✔ Verifiziert</span>
            </p>
          )}
          {!meta && (
            <p className="text-xs text-brand-night-navy/60">
              <span className="font-semibold text-accent">✔ Verifiziert</span>
            </p>
          )}
          {team.publicTagline && (
            <p className="line-clamp-2 text-xs text-brand-night-navy/70 italic">
              „{team.publicTagline}"
            </p>
          )}
          {teaser && (
            <p className="text-xs font-semibold text-brand-night-navy/50">{teaser}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 border-t border-brand-neutral/20 px-4 py-3">
          {profileHref ? (
            <Link
              href={profileHref}
              className="flex-1 rounded-lg border border-brand-neutral/40 px-3 py-2 text-center text-xs font-semibold text-brand-night-navy hover:bg-brand-neutral/10 transition-colors"
            >
              Profil ansehen
            </Link>
          ) : (
            <span className="flex-1 rounded-lg border border-brand-neutral/20 px-3 py-2 text-center text-xs font-semibold text-brand-night-navy/30 cursor-not-allowed">
              Profil ansehen
            </span>
          )}

          {mode === "public" ? (
            profileHref ? (
              <Link
                href={profileHref}
                className="flex-1 rounded-lg bg-accent px-3 py-2 text-center text-xs font-semibold text-brand-night-navy hover:bg-accent/90 transition-colors"
              >
                Anfragen
              </Link>
            ) : null
          ) : done ? (
            <button
              type="button"
              disabled
              className="flex-1 rounded-lg bg-success-muted px-3 py-2 text-center text-xs font-semibold text-success-dark cursor-not-allowed"
            >
              ✓ Bereits angefragt
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="flex-1 rounded-lg bg-accent px-3 py-2 text-center text-xs font-semibold text-brand-night-navy hover:bg-accent/90 transition-colors"
            >
              Anfragen
            </button>
          )}
        </div>
      </article>

      {/* Inline inquiry sheet — only for sponsor mode */}
      {mode === "sponsor" && (
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="right" className="w-[90%] sm:max-w-md bg-white">
            <SheetHeader>
              <SheetTitle className="text-left">
                <span className="block text-[0.65rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
                  Sponsoring anfragen
                </span>
                <span className="block font-display font-bold text-xl tracking-tight text-brand-night-navy">
                  {team.clubName} · {team.teamName}
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
              <div className="mt-6 rounded-xl border border-success/30 bg-success-muted p-4 text-sm text-success-dark">
                ✓ Deine Anfrage wurde versendet. Die Mannschaft meldet sich per Mail.
              </div>
            ) : (
              <div className="mt-6 space-y-3">
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
                    className="mt-1.5 w-full rounded-lg bg-white shadow-ios-card px-3 py-2 text-sm text-brand-night-navy focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
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
      )}
    </>
  );
}
