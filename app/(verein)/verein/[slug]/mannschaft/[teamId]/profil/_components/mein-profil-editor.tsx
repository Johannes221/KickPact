"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveTeamPublicProfile } from "@/lib/actions/team-public-profile";
import { setTeamShowInsights } from "@/lib/actions/team-images";
import { renameTeam } from "@/lib/actions/team-lifecycle";
import { saisonLabel } from "@/lib/utils/saison";
import { UpgradeGateDialog } from "@/components/billing/upgrade-gate";
import {
  UpgradeRequiredError,
  isUpgradeRequiredError,
  type LockKind
} from "@/lib/billing/upgrade-offer";
import type { PlanKey } from "@/lib/stripe/pricing";

// Akzeptierte Endungen (inkl. iPhone-HEIC/HEIF — Server konvertiert nach JPEG).
// MIME-Type-Prüfung bewusst lasch: Mobile-Browser senden gelegentlich einen
// leeren `file.type`. Der Server validiert autoritativ via lib/storage/images.
const ACCEPT =
  "image/png,image/jpeg,image/webp,image/heic,image/heif,.png,.jpg,.jpeg,.webp,.heic,.heif";
const MAX_BYTES = 10_000_000;
const TAGLINE_MAX = 280;
const GOALS_MAX = 600;
const GALLERY_MAX = 8;

interface GalleryItem {
  id: string;
  url: string;
}

interface Props {
  slug: string;
  teamId: string;
  teamName: string;
  saison: string;
  league: string | null;
  clubName: string;
  clubOrt: string | null;
  isVerified: boolean;
  coverUrl: string | null;
  logoUrl: string | null;
  gallery: GalleryItem[];
  showInsights: boolean;
  discoverable: boolean;
  publicSlug: string | null;
  publicName: string;
  publicTagline: string;
  publicGoals: string;
  /** Abo-Sperre (aus dem Subscription-Gate). `null` = alles erlaubt. */
  lock: LockKind | null;
  currentPlan: PlanKey;
  /** Serverseitig ermittelt (isNativeAppRequest) — steuert nur das Wording. */
  nativeApp: boolean;
}

export function MeinProfilEditor({
  slug,
  teamId,
  teamName,
  saison,
  league,
  clubName,
  clubOrt,
  isVerified,
  coverUrl,
  logoUrl,
  gallery,
  showInsights,
  discoverable,
  publicSlug,
  publicName: initialPublicName,
  publicTagline: initialTagline,
  publicGoals: initialGoals,
  lock,
  currentPlan,
  nativeApp
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // Gesperrte Aktion → echte Upgrade-Aufforderung (Dialog) statt Mini-Toast.
  const [upsell, setUpsell] = useState<{
    feature: string;
    lock: LockKind;
  } | null>(null);

  /**
   * Vorab-Gate: die Sperre ist serverseitig bekannt, also gar nicht erst
   * losschicken. `true` = blockiert (Aufrufer bricht ab). Der Server bleibt die
   * autoritative Instanz — dieser Check ist reine UX, kein Sicherheits-Gate.
   */
  function blockedByPlan(feature: string): boolean {
    if (!lock) return false;
    setUpsell({ feature, lock });
    return true;
  }

  // Lokaler State für Edit-Felder.
  const [name, setName] = useState(teamName);
  const [isPublic, setIsPublic] = useState(discoverable);
  const [publicName, setPublicName] = useState(initialPublicName);
  const [tagline, setTagline] = useState(initialTagline);
  const [goals, setGoals] = useState(initialGoals);
  const [editingName, setEditingName] = useState(false);

  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const verifikationHref = `/verein/${slug}/mannschaft/${teamId}/verifikation`;
  const meta = [clubName, league, clubOrt].filter(Boolean).join(" · ");

  // ---- Uploads (Cover / Logo / Galerie) -------------------------------------

  /**
   * Upload läuft bewusst über den Route-Handler (nicht über eine Server-Action:
   * dort greift Nexts 1-MB-Bodylimit). HEIC→JPEG passiert serverseitig in
   * `normalizeImageUpload` — gilt damit automatisch für jede Datei.
   *
   * Wirft `UpgradeRequiredError` bei HTTP 402 (Abo-Sperre), sonst `Error` mit
   * der server-gelieferten Meldung.
   */
  async function uploadTo(path: string, file: File) {
    if (file.size > MAX_BYTES) {
      const mb = (file.size / 1_000_000).toFixed(1);
      throw new Error(`Bild zu groß (${mb} MB) — max. 10 MB erlaubt.`);
    }
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(path, { method: "POST", body: fd });
    if (res.ok) return;
    const d = (await res.json().catch(() => null)) as {
      message?: string;
      lock?: LockKind;
    } | null;
    if (res.status === 402) {
      // Server sagt „Abo fehlt" — z.B. wenn das Gate seit dem Seitenaufbau
      // gekippt ist (abgelaufener Trial im offenen Tab).
      throw new UpgradeRequiredError(
        d?.lock ?? "expired",
        d?.message ?? "Dafür braucht es ein aktives Abo."
      );
    }
    throw new Error(d?.message ?? "Upload fehlgeschlagen.");
  }

  /** Fehler-Feedback für Einzel-Uploads: Abo-Sperre → Dialog, sonst Toast. */
  function reportUploadError(e: unknown, feature: string, toastId: string) {
    if (isUpgradeRequiredError(e)) {
      toast.dismiss(toastId);
      setUpsell({ feature, lock: e.lock });
      return;
    }
    toast.error(e instanceof Error ? e.message : "Fehler.", { id: toastId });
  }

  function onCover(file: File) {
    if (blockedByPlan("Das Cover")) return;
    start(async () => {
      try {
        toast.loading("Lade Cover hoch…", { id: "cover-upload" });
        await uploadTo(`/api/teams/${teamId}/cover`, file);
        toast.success("Cover aktualisiert.", { id: "cover-upload" });
        router.refresh();
      } catch (e) {
        reportUploadError(e, "Das Cover", "cover-upload");
      }
    });
  }

  function onLogo(file: File) {
    if (blockedByPlan("Das Logo")) return;
    start(async () => {
      try {
        toast.loading("Lade Logo hoch…", { id: "logo-upload" });
        await uploadTo(`/api/teams/${teamId}/logo`, file);
        toast.success("Logo aktualisiert.", { id: "logo-upload" });
        router.refresh();
      } catch (e) {
        reportUploadError(e, "Das Logo", "logo-upload");
      }
    });
  }

  function onGallery(file: File) {
    if (blockedByPlan("Die Galerie")) return;
    start(async () => {
      try {
        toast.loading("Lade Bild hoch…", { id: "gallery-upload" });
        await uploadTo(`/api/teams/${teamId}/images`, file);
        toast.success("Bild hinzugefügt.", { id: "gallery-upload" });
        router.refresh();
      } catch (e) {
        reportUploadError(e, "Die Galerie", "gallery-upload");
      }
    });
  }

  function onDeleteImage(id: string) {
    if (blockedByPlan("Die Galerie")) return;
    start(async () => {
      const res = await fetch(`/api/teams/${teamId}/images/${id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        toast.success("Bild entfernt.");
        router.refresh();
        return;
      }
      // Gate seit Seitenaufbau gekippt → echte Upgrade-Aufforderung statt
      // „Löschen fehlgeschlagen."
      if (res.status === 402) {
        const d = (await res.json().catch(() => null)) as {
          lock?: LockKind;
        } | null;
        setUpsell({ feature: "Die Galerie", lock: d?.lock ?? "expired" });
        return;
      }
      toast.error("Löschen fehlgeschlagen.");
    });
  }

  // ---- Name (renameTeam) ----------------------------------------------------

  function handleRename() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name darf nicht leer sein.");
      return;
    }
    if (trimmed.length > 80) {
      toast.error("Name max. 80 Zeichen.");
      return;
    }
    if (trimmed === teamName) {
      setEditingName(false);
      return;
    }
    if (blockedByPlan("Der Mannschaftsname")) return;
    start(async () => {
      try {
        await renameTeam({ teamId, newName: trimmed });
        toast.success("Name aktualisiert.");
        setEditingName(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler beim Speichern.");
      }
    });
  }

  // ---- Insights-Toggle (setTeamShowInsights) --------------------------------

  function onToggleInsights(next: boolean) {
    if (blockedByPlan("Die Saison-Insights")) return;
    start(async () => {
      try {
        await setTeamShowInsights({ teamId, show: next });
        router.refresh();
      } catch {
        toast.error("Konnte Einstellung nicht speichern.");
      }
    });
  }

  // ---- Öffentlich-Schalter + Über-uns (saveTeamPublicProfile) ---------------

  function persistPublicProfile(nextIsPublic: boolean) {
    if (tagline.length > TAGLINE_MAX) {
      toast.error(`Kurzbeschreibung max. ${TAGLINE_MAX} Zeichen.`);
      return;
    }
    if (goals.length > GOALS_MAX) {
      toast.error(`Ziele max. ${GOALS_MAX} Zeichen.`);
      return;
    }
    if (blockedByPlan("Das öffentliche Profil")) return;
    start(async () => {
      try {
        await saveTeamPublicProfile({
          teamId,
          isPublic: nextIsPublic,
          publicName: publicName.trim() || undefined,
          publicTagline: tagline.trim() || undefined,
          publicGoals: goals.trim() || undefined
        });
        toast.success(
          nextIsPublic
            ? isVerified
              ? "Gespeichert & öffentlich."
              : "Gespeichert. Öffentlich sichtbar, sobald verifiziert."
            : "Gespeichert (privat)."
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
      }
    });
  }

  function onTogglePublic(next: boolean) {
    // Gate VOR dem lokalen Flip: sonst zeigt der Schalter „öffentlich" an,
    // obwohl serverseitig nichts gespeichert wurde.
    if (blockedByPlan("Das öffentliche Profil")) return;
    setIsPublic(next);
    persistPublicProfile(next);
  }

  return (
    <div className="mx-auto max-w-screen-sm pb-12">
      {/* Die „richtige Fehlermeldung" bei gesperrten Aktionen — EIN Dialog für
          alle Stellen dieser Seite (Cover/Logo/Galerie/Name/Insights/Profil). */}
      {upsell && (
        <UpgradeGateDialog
          open
          onOpenChange={(o) => !o && setUpsell(null)}
          lock={upsell.lock}
          currentPlan={currentPlan}
          clubSlug={slug}
          teamId={teamId}
          feature={upsell.feature}
          nativeApp={nativeApp}
        />
      )}

      {/* 1. Sticky Edit-Toolbar — eine ruhige, nie quetschende Reihe; auf
          schmalen Screens bricht der Titel über die Controls. */}
      <div className="sticky top-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-brand-neutral/30 bg-white/90 px-4 py-2.5 backdrop-blur md:mx-0 md:rounded-t-2xl">
        <h2 className="title-wrap text-[17px] font-semibold text-brand-night-navy">
          Mein Profil
        </h2>
        <div className="flex items-center gap-2.5">
          {/* Beschriftetes Switch statt nackter Checkbox */}
          <label className="inline-flex cursor-pointer select-none items-center gap-2 rounded-full border border-brand-neutral/40 bg-brand-off-white/60 px-2.5 py-1.5">
            <span className="relative inline-flex h-5 w-9 shrink-0 items-center">
              <input
                type="checkbox"
                checked={isPublic}
                disabled={pending}
                onChange={(e) => onTogglePublic(e.target.checked)}
                className="peer sr-only"
              />
              <span className="absolute inset-0 rounded-full bg-brand-neutral/50 transition-colors peer-checked:bg-accent peer-disabled:opacity-50" />
              <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white shadow-ios-card transition-transform peer-checked:translate-x-4" />
            </span>
            <span className="text-xs font-semibold text-brand-night-navy">
              Öffentlich
            </span>
          </label>
          {publicSlug && isPublic && isVerified && (
            <Link
              href={`/m/${publicSlug}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-full bg-white shadow-ios-card px-3 py-1.5 text-xs font-semibold text-brand-night-navy transition-colors hover:bg-brand-off-white"
            >
              <Eye className="h-4 w-4" aria-hidden />
              Live-Vorschau
            </Link>
          )}
        </div>
        {isPublic && !isVerified && (
          <p className="basis-full text-[11px] font-medium text-brand-night-navy/60">
            Wird öffentlich sichtbar, sobald die Mannschaft verifiziert ist.
          </p>
        )}
      </div>

      {/* 2. Hero (dunkel) */}
      <header id="logo" className="relative -mx-4 h-64 scroll-mt-24 overflow-hidden bg-brand-night-navy md:mx-0">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-50"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/brand/team-fallback.jpg"
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-brand-night-navy via-brand-night-navy/45 to-brand-night-navy/10" />

        {/* Obere Reihe: Saison-Chip links, Cover-Upload rechts — getrennt vom
            Avatar (unten) und untereinander nie überlappend. */}
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur">
            Saison {saisonLabel(saison)}
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => coverInputRef.current?.click()}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-2 text-xs font-semibold text-brand-night-navy shadow-md ring-1 ring-black/5 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Camera className="h-4 w-4" aria-hidden />
            {coverUrl ? "Cover ändern" : "Cover hinzufügen"}
          </button>
        </div>
        <input
          ref={coverInputRef}
          type="file"
          accept={ACCEPT}
          disabled={pending}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onCover(f);
            e.currentTarget.value = "";
          }}
        />

        <div className="absolute inset-x-4 bottom-4">
          {/* Logo-Badge + ändern */}
          <div className="relative inline-block">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-accent text-xl font-bold text-brand-night-navy shadow-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl ?? "/brand/team-crest-fallback.png"}
                alt="Logo"
                className="h-full w-full object-cover"
              />
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => logoInputRef.current?.click()}
              aria-label="Logo ändern"
              title="Logo ändern"
              className="absolute -bottom-1.5 -right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white shadow-md ring-2 ring-white transition-colors hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Camera className="h-3.5 w-3.5" aria-hidden />
            </button>
            <input
              ref={logoInputRef}
              type="file"
              accept={ACCEPT}
              disabled={pending}
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onLogo(f);
                e.currentTarget.value = "";
              }}
            />
          </div>

          {/* Name inline editierbar */}
          {editingName ? (
            <div className="mt-3 flex items-center gap-2">
              <Input
                value={name}
                autoFocus
                disabled={pending}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") {
                    setName(teamName);
                    setEditingName(false);
                  }
                }}
                className="h-9 flex-1 bg-white"
              />
              <Button
                onClick={handleRename}
                disabled={pending || !name.trim() || name.trim() === teamName}
                variant="accent"
                className="h-9"
              >
                Speichern
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditingName(true)}
              className="group mt-3 flex w-full items-start gap-2 text-left"
            >
              <h1 className="title-wrap text-[24px] font-bold leading-[1.2] text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.45)] md:text-[28px]">
                {name}
              </h1>
              <span className="mt-1.5 shrink-0 rounded-md bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                ✎ umbenennen
              </span>
            </button>
          )}

          {/* Meta-Zeile (read-only) */}
          {meta && (
            <p className="title-wrap mt-1 text-xs text-white/75 [text-shadow:0_1px_6px_rgba(0,0,0,0.4)]">
              {meta}
            </p>
          )}
        </div>
      </header>

      <div className="space-y-6 px-0 pt-6">
        {/* 3. Verifikations-Zeile */}
        <div className="rounded-2xl bg-white shadow-ios-card p-4">
          {isVerified ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-accent-dark">
                ✔ Verifiziert
              </span>
              <Link
                href={verifikationHref}
                className="text-xs font-semibold text-brand-night-navy/70 underline underline-offset-2 hover:text-brand-night-navy"
              >
                Status ansehen
              </Link>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-brand-night-navy">
                  Noch nicht verifiziert
                </p>
                <p className="mt-0.5 text-xs text-brand-night-navy/60">
                  Verifizierte Mannschaften wirken vertrauenswürdiger auf
                  Sponsoren.
                </p>
              </div>
              <Button asChild variant="accent" size="sm" className="shrink-0">
                <Link href={verifikationHref}>Mannschaft verifizieren →</Link>
              </Button>
            </div>
          )}
        </div>

        {/* 4. Insights-Toggle */}
        <div className="rounded-2xl bg-white shadow-ios-card p-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={showInsights}
              disabled={pending}
              onChange={(e) => onToggleInsights(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-brand-neutral/40 accent-accent disabled:cursor-not-allowed"
            />
            <span>
              <span className="block text-[15px] font-semibold text-brand-night-navy">
                Saison-Insights anzeigen
              </span>
              <span className="mt-0.5 block text-sm text-brand-night-navy/60">
                Tore, Spiele und Statistiken auf dem öffentlichen Profil zeigen.
              </span>
            </span>
          </label>
        </div>

        {/* 5. Galerie */}
        <div className="rounded-2xl bg-white shadow-ios-card p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-brand-night-navy">
              Galerie
            </h3>
            <span className="text-xs font-semibold text-brand-night-navy/50">
              {gallery.length}/{GALLERY_MAX}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {gallery.map((g) => (
              <div key={g.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={g.url}
                  alt=""
                  className="h-20 w-28 rounded-lg object-cover"
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onDeleteImage(g.id)}
                  aria-label="Bild entfernen"
                  className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white transition-colors hover:bg-black/80 disabled:cursor-not-allowed"
                >
                  ✕
                </button>
              </div>
            ))}
            {gallery.length < GALLERY_MAX && (
              <button
                type="button"
                disabled={pending}
                onClick={() => galleryInputRef.current?.click()}
                className="flex h-20 w-28 flex-col items-center justify-center rounded-lg border-2 border-dashed border-brand-neutral/40 text-brand-night-navy/50 transition-colors hover:border-accent/40 hover:bg-brand-off-white/40 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="text-xl leading-none">＋</span>
                <span className="mt-1 text-[11px] font-semibold">Bild</span>
              </button>
            )}
          </div>
          <input
            ref={galleryInputRef}
            type="file"
            accept={ACCEPT}
            disabled={pending || gallery.length >= GALLERY_MAX}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onGallery(f);
              e.currentTarget.value = "";
            }}
          />
        </div>

        {/* 6. Über uns */}
        <div className="space-y-5 rounded-2xl bg-white shadow-ios-card p-4">
          <h3 className="text-[15px] font-semibold text-brand-night-navy">
            Über uns
          </h3>

          <div className="space-y-2">
            <Label htmlFor="public-name" className="text-sm font-semibold">
              Öffentlicher Name
            </Label>
            <Input
              id="public-name"
              value={publicName}
              onChange={(e) => setPublicName(e.target.value)}
              placeholder={name}
              maxLength={80}
              disabled={pending}
            />
            <p className="text-xs text-brand-night-navy/50">
              Leer lassen = „{name}".
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

          <Button
            onClick={() => persistPublicProfile(isPublic)}
            disabled={pending}
            variant="accent"
          >
            {pending ? "Speichere…" : "Speichern"}
          </Button>
        </div>
      </div>
    </div>
  );
}
