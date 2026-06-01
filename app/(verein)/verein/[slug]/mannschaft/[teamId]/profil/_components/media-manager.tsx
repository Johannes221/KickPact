"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setTeamShowInsights } from "@/lib/actions/team-images";

// Akzeptierte Endungen (inkl. iPhone-HEIC/HEIF — Server konvertiert nach JPEG).
// MIME-Type-Prüfung bewusst lasch: Mobile-Browser senden gelegentlich einen
// leeren `file.type`. Der Server validiert autoritativ via lib/storage/images.
const ACCEPT =
  "image/png,image/jpeg,image/webp,image/heic,image/heif,.png,.jpg,.jpeg,.webp,.heic,.heif";
const MAX_BYTES = 10_000_000;

interface GalleryItem {
  id: string;
  url: string;
}

interface MediaManagerProps {
  teamId: string;
  coverUrl: string | null;
  gallery: GalleryItem[];
  showInsights: boolean;
}

export function MediaManager({
  teamId,
  coverUrl,
  gallery,
  showInsights,
}: MediaManagerProps) {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function upload(path: string, file: File) {
    if (file.size > MAX_BYTES) {
      const mb = (file.size / 1_000_000).toFixed(1);
      toast.error(`Bild zu groß (${mb} MB) — max. 10 MB erlaubt.`);
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(path, { method: "POST", body: fd });
    if (!res.ok) {
      const d = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(d?.message ?? "Upload fehlgeschlagen.");
    }
  }

  function onCover(file: File) {
    start(async () => {
      try {
        toast.loading("Lade Cover hoch…", { id: "cover-upload" });
        await upload(`/api/teams/${teamId}/cover`, file);
        toast.success("Cover aktualisiert.", { id: "cover-upload" });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler.", {
          id: "cover-upload",
        });
      }
    });
  }

  function onGallery(file: File) {
    start(async () => {
      try {
        toast.loading("Lade Bild hoch…", { id: "gallery-upload" });
        await upload(`/api/teams/${teamId}/images`, file);
        toast.success("Bild hinzugefügt.", { id: "gallery-upload" });
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler.", {
          id: "gallery-upload",
        });
      }
    });
  }

  function onDelete(id: string) {
    start(async () => {
      const res = await fetch(`/api/teams/${teamId}/images/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Bild entfernt.");
        router.refresh();
      } else {
        toast.error("Löschen fehlgeschlagen.");
      }
    });
  }

  function onToggle(next: boolean) {
    start(async () => {
      try {
        await setTeamShowInsights({ teamId, show: next });
        router.refresh();
      } catch {
        toast.error("Konnte Einstellung nicht speichern.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-display font-bold text-lg text-brand-night-navy">
          Medien &amp; Insights
        </h3>
        <p className="mt-0.5 text-sm text-brand-night-navy/60">
          Cover-Bild, Galerie und Saison-Statistiken für das öffentliche Profil.
        </p>
      </div>

      {/* Cover */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-brand-night-navy">
          Cover-Bild
        </label>
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt="Cover"
            className="h-28 w-full rounded-lg object-cover"
          />
        )}
        <div
          className={
            "rounded-lg border-2 border-dashed p-3 text-center transition-colors " +
            (pending
              ? "cursor-not-allowed border-brand-neutral/30 opacity-60"
              : "cursor-pointer border-brand-neutral/40 hover:border-accent/40 hover:bg-brand-off-white/40")
          }
        >
          <label className="cursor-pointer">
            <span className="text-sm font-semibold text-brand-night-navy">
              {pending ? "Wird hochgeladen…" : "Cover auswählen"}
            </span>
            <p className="mt-0.5 text-xs text-brand-night-navy/50">
              PNG, JPEG, WebP oder HEIC · max. 10 MB
            </p>
            <input
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
          </label>
        </div>
      </div>

      {/* Gallery */}
      <div className="space-y-2">
        <label className="block text-sm font-semibold text-brand-night-navy">
          Galerie ({gallery.length}/8)
        </label>
        {gallery.length > 0 && (
          <div className="flex flex-wrap gap-2">
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
                  onClick={() => onDelete(g.id)}
                  className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white hover:bg-black/80 disabled:cursor-not-allowed"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {gallery.length < 8 && (
          <div
            className={
              "rounded-lg border-2 border-dashed p-3 text-center transition-colors " +
              (pending
                ? "cursor-not-allowed border-brand-neutral/30 opacity-60"
                : "cursor-pointer border-brand-neutral/40 hover:border-accent/40 hover:bg-brand-off-white/40")
            }
          >
            <label className="cursor-pointer">
              <span className="text-sm font-semibold text-brand-night-navy">
                {pending ? "Wird hochgeladen…" : "Bild hinzufügen"}
              </span>
              <p className="mt-0.5 text-xs text-brand-night-navy/50">
                PNG, JPEG, WebP oder HEIC · max. 10 MB
              </p>
              <input
                type="file"
                accept={ACCEPT}
                disabled={pending || gallery.length >= 8}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onGallery(f);
                  e.currentTarget.value = "";
                }}
              />
            </label>
          </div>
        )}
      </div>

      {/* Insights toggle */}
      <label className="flex cursor-pointer items-center gap-3 text-sm">
        <input
          type="checkbox"
          defaultChecked={showInsights}
          disabled={pending}
          className="h-4 w-4 rounded border-brand-neutral/40 accent-accent disabled:cursor-not-allowed"
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="font-medium text-brand-night-navy">
          Saison-Insights auf dem öffentlichen Profil anzeigen
        </span>
      </label>
    </div>
  );
}
