"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveTeamPublicProfile } from "@/lib/actions/team-public-profile";

interface Initial {
  isPublic: boolean;
  publicSlug: string | null;
  publicName: string;
  publicTagline: string;
  publicGoals: string;
}

interface Props {
  teamId: string;
  teamName: string;
  initial: Initial;
  logoUrl: string | null;
  einstellungenHref: string;
}

const TAGLINE_MAX = 280;
const GOALS_MAX = 600;

export function PublicProfileForm({
  teamId,
  teamName,
  initial,
  logoUrl,
  einstellungenHref
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [isPublic, setIsPublic] = useState(initial.isPublic);
  const [publicName, setPublicName] = useState(initial.publicName);
  const [tagline, setTagline] = useState(initial.publicTagline);
  const [goals, setGoals] = useState(initial.publicGoals);
  const [slug, setSlug] = useState(initial.publicSlug);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  const publicUrl = slug ? `${origin}/m/${slug}` : null;

  function handleSave() {
    if (tagline.length > TAGLINE_MAX) {
      toast.error(`Kurzbeschreibung max. ${TAGLINE_MAX} Zeichen.`);
      return;
    }
    if (goals.length > GOALS_MAX) {
      toast.error(`Ziele max. ${GOALS_MAX} Zeichen.`);
      return;
    }
    startTransition(async () => {
      try {
        const res = await saveTeamPublicProfile({
          teamId,
          isPublic,
          publicName: publicName.trim() || undefined,
          publicTagline: tagline.trim() || undefined,
          publicGoals: goals.trim() || undefined
        });
        if (res.slug) setSlug(res.slug);
        toast.success(
          isPublic
            ? "Profil gespeichert & öffentlich."
            : "Profil gespeichert (privat)."
        );
        router.refresh();
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Speichern fehlgeschlagen."
        );
      }
    });
  }

  function copyUrl() {
    if (!publicUrl) return;
    navigator.clipboard?.writeText(publicUrl).then(
      () => toast.success("Link kopiert."),
      () => toast.error("Konnte Link nicht kopieren.")
    );
  }

  return (
    <div className="space-y-6">
      {/* Öffentlich-Toggle */}
      <div className="rounded-2xl border border-brand-neutral/40 bg-white p-4 md:p-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 rounded border-brand-neutral/60 text-accent focus:ring-accent"
          />
          <span>
            <span className="block font-display font-black text-base tracking-tight text-brand-night-navy">
              Profil öffentlich schalten
            </span>
            <span className="mt-0.5 block text-sm text-brand-night-navy/60">
              Wenn aktiv, ist die Profilseite unter eurer URL erreichbar und
              Sponsoren können „Sponsoring anfragen". Ohne Haken bleibt das
              Profil privat (Seite zeigt 404).
            </span>
          </span>
        </label>

        {publicUrl && (
          <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-3">
            <div className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50">
              Eure öffentliche URL
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="text-sm font-semibold text-brand-night-navy break-all">
                {publicUrl}
              </code>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href={`/m/${slug}`}
                target="_blank"
                className="inline-flex items-center rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent-dark transition-colors"
              >
                Profil ansehen →
              </Link>
              <button
                type="button"
                onClick={copyUrl}
                className="inline-flex items-center rounded-lg border border-brand-neutral/40 bg-white px-3 py-1.5 text-xs font-semibold text-brand-night-navy/80 hover:border-accent/40 transition-colors"
              >
                Link kopieren
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Felder */}
      <div className="space-y-5 rounded-2xl border border-brand-neutral/40 bg-white p-4 md:p-5">
        <div className="space-y-2">
          <Label htmlFor="public-name" className="text-sm font-semibold">
            Öffentlicher Name
          </Label>
          <Input
            id="public-name"
            value={publicName}
            onChange={(e) => setPublicName(e.target.value)}
            placeholder={teamName}
            maxLength={80}
            disabled={pending}
          />
          <p className="text-xs text-brand-night-navy/50">
            Wie ihr öffentlich auftreten wollt. Leer lassen = „{teamName}".
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="public-tagline" className="text-sm font-semibold">
            Kurzbeschreibung
          </Label>
          <Textarea
            id="public-tagline"
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="Ein Satz, der eure Mannschaft auf den Punkt bringt."
            rows={2}
            maxLength={TAGLINE_MAX}
            disabled={pending}
          />
          <p className="text-xs text-brand-night-navy/50">
            {tagline.length}/{TAGLINE_MAX}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="public-goals" className="text-sm font-semibold">
            Eure Ziele
          </Label>
          <Textarea
            id="public-goals"
            value={goals}
            onChange={(e) => setGoals(e.target.value)}
            placeholder="Wofür sammelt ihr? Neue Trikots, Aufstieg, Jugendarbeit … Sponsoren wollen wissen, was sie unterstützen."
            rows={4}
            maxLength={GOALS_MAX}
            disabled={pending}
          />
          <p className="text-xs text-brand-night-navy/50">
            {goals.length}/{GOALS_MAX}
          </p>
        </div>

        {/* Logo-Hinweis */}
        <div className="flex items-center gap-3 rounded-xl border border-brand-neutral/30 bg-brand-off-white/50 p-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-brand-neutral/40 bg-white flex items-center justify-center">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Logo"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-[0.6rem] text-brand-night-navy/40">
                Kein Logo
              </span>
            )}
          </div>
          <p className="text-xs text-brand-night-navy/60">
            Das Logo erscheint auch auf dem öffentlichen Profil. Du änderst es in
            den{" "}
            <Link
              href={einstellungenHref}
              className="font-semibold text-accent-dark underline"
            >
              Stammdaten
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={pending} variant="accent">
          {pending ? "Speichere…" : "Profil speichern"}
        </Button>
        {isPublic ? (
          <span className="text-xs font-semibold text-emerald-700">
            ● Öffentlich
          </span>
        ) : (
          <span className="text-xs font-semibold text-brand-night-navy/40">
            ● Privat
          </span>
        )}
      </div>
    </div>
  );
}
