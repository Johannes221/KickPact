"use client";

import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { updateClubPublicProfile } from "@/lib/actions/club-profile";

const DESCRIPTION_MAX = 2000;

/**
 * Pflege-Karte „Öffentliches Vereinsprofil" (Phase 5 Paket C). Beschreibung
 * (max. 2000 Zeichen) via Server-Action; Hero-Bild via Route-Handler
 * /api/clubs/[clubId]/hero (KEINE Server-Action — 1-MB-Bodylimit-Falle,
 * gleiches Muster wie Team-Logo/Avatar). Sichtbar ist das Profil unter
 * /v/[slug] erst nach Vereins-Verifizierung.
 */
export function PublicProfileCard({
  slug,
  clubId,
  initialDescription,
  hasHero,
  isVerified
}: {
  slug: string;
  clubId: string;
  initialDescription: string;
  hasHero: boolean;
  isVerified: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [description, setDescription] = useState(initialDescription);
  const [heroVersion, setHeroVersion] = useState(0);
  const [heroVisible, setHeroVisible] = useState(hasHero);

  function onSave() {
    startTransition(async () => {
      const res = await updateClubPublicProfile(slug, { descriptionMd: description });
      if (!res.ok) {
        toast.error(res.message ?? "Fehler beim Speichern");
      } else {
        toast.success("Gespeichert ✓");
      }
    });
  }

  async function onPickHero(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/clubs/${clubId}/hero`, {
        method: "POST",
        body: fd,
        credentials: "include"
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Upload fehlgeschlagen.");
      toast.success("Titelbild aktualisiert.");
      setHeroVisible(true);
      setHeroVersion((n) => n + 1);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="rounded-2xl bg-white shadow-ios-card p-5 md:p-6 space-y-5">
      <div>
        <h3 className="font-display font-bold text-base md:text-lg tracking-tight text-brand-night-navy">
          Öffentliches Vereinsprofil
        </h3>
        <p className="mt-1 text-xs text-brand-night-navy/60">
          {isVerified ? (
            <>
              Sponsoren sehen euer Profil unter{" "}
              <Link
                href={`/v/${slug}`}
                target="_blank"
                className="font-semibold text-accent-dark underline underline-offset-2"
              >
                kickpact.com/v/{slug}
              </Link>
              {" "}— mit allen Mannschaften des Vereins.
            </>
          ) : (
            "Euer öffentliches Profil geht live, sobald der Verein verifiziert ist. Beschreibung und Titelbild könnt ihr jetzt schon pflegen."
          )}
        </p>
      </div>

      {/* Hero-Bild */}
      <div className="space-y-2">
        {heroVisible && (
          <div className="overflow-hidden rounded-xl border border-brand-neutral/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/clubs/${clubId}/hero?v=${heroVersion}`}
              alt="Titelbild des Vereinsprofils"
              className="h-32 w-full object-cover"
            />
          </div>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickHero}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Lädt…" : heroVisible ? "Titelbild ändern" : "Titelbild hochladen"}
        </Button>
        <p className="text-xs text-brand-night-navy/50">
          JPG, PNG oder HEIC — Querformat wirkt am besten. Ohne Bild zeigt das Profil
          einen dezenten Farbverlauf.
        </p>
      </div>

      {/* Beschreibung */}
      <div className="space-y-2">
        <label
          htmlFor="club-description"
          className="text-sm font-medium text-brand-night-navy"
        >
          Beschreibung
        </label>
        <Textarea
          id="club-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={DESCRIPTION_MAX}
          rows={6}
          placeholder="Erzählt Sponsoren, wer ihr seid: Geschichte, Jugendarbeit, wofür ihr sammelt…"
        />
        <p className="text-right text-xs text-brand-night-navy/40">
          {description.length}/{DESCRIPTION_MAX}
        </p>
      </div>

      <div className="flex justify-end">
        <Button type="button" variant="accent" disabled={pending} onClick={onSave}>
          {pending ? "Speichere…" : "Profil speichern"}
        </Button>
      </div>
    </section>
  );
}
