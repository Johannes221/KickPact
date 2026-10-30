"use client";

import { useCallback, useEffect, useState } from "react";
import { Share2, Loader2, ImageDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import { shareImageFile } from "@/lib/platform/files";
import {
  canShareToInstagramStory,
  shareImageToInstagramStory
} from "@/lib/platform/instagram";

/**
 * „Jetzt teilen" für ein Spiel (Aufgabe #44): zeigt erst die Story-Vorschau,
 * dann teilt man sie.
 *
 * Die Vorschau ist BEWUSST genau dasselbe Bild, das später geteilt wird (die
 * story-image-Route) — kein nachgebautes HTML-Preview, das vom Motiv abweichen
 * könnte. Kostet einen Request, dafür sieht man garantiert das Echte.
 *
 * Wiederverwendbar für kommende UND vergangene Spiele; die Route wählt die
 * Vorlage selbst anhand des Spielstatus.
 */

/** Wie das Wrapped: Abbruch durch den Nutzer ist kein Fehler. */
function notifyShareError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/cancel/i.test(msg)) return;
  toast.error("Teilen hat nicht geklappt — bitte nochmal versuchen.");
}

export interface StoryShareButtonProps {
  teamId: string;
  matchId: string;
  /** Beschriftung des auslösenden Buttons (z.B. „Vorschau posten"). */
  label?: string;
  variant?: "accent" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
}

export function StoryShareButton({
  teamId,
  matchId,
  label = "Jetzt teilen",
  variant = "outline",
  size = "default",
  className
}: StoryShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sharing, setSharing] = useState(false);

  // Cache-Buster: bei jedem Öffnen der Vorschau frisch. Ohne ihn zeigte die App
  // nach einem Crawl (neue Vereinswappen) das alte gecachte Bild mit Kürzel.
  // Stabil, solange der Dialog offen ist → Anzeige und geteiltes Bild sind gleich.
  const [bust, setBust] = useState(0);
  useEffect(() => {
    if (open) {
      setBust(Date.now());
      setLoaded(false);
      setFailed(false);
    }
  }, [open]);

  const imageUrl = `/api/teams/${teamId}/story-image/${matchId}${bust ? `?v=${bust}` : ""}`;
  const filename = `kickpact-story-${matchId}.png`;

  const share = useCallback(async () => {
    setSharing(true);
    try {
      await shareImageFile(imageUrl, filename);
    } catch (err) {
      notifyShareError(err);
    } finally {
      setSharing(false);
    }
  }, [imageUrl, filename]);

  /**
   * Direktweg in den Instagram-Story-Editor (iOS-App + Instagram installiert +
   * Meta-App-ID). Verfügbarkeit erst beim Tap prüfen — immer frisch, kein State.
   * Scheitert der Direktweg, übernimmt das generische Share-Sheet.
   */
  const shareToInsta = useCallback(async () => {
    setSharing(true);
    try {
      if (await canShareToInstagramStory()) {
        try {
          await shareImageToInstagramStory(imageUrl);
          return;
        } catch {
          // z.B. Instagram zwischenzeitlich deinstalliert → Fallback unten.
        }
      }
      await shareImageFile(imageUrl, filename);
    } catch (err) {
      notifyShareError(err);
    } finally {
      setSharing(false);
    }
  }, [imageUrl, filename]);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => {
          setLoaded(false);
          setFailed(false);
          setOpen(true);
        }}
      >
        <Share2 className="mr-2 h-4 w-4" aria-hidden />
        {label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Story-Vorschau</DialogTitle>
            <DialogDescription>
              So landet das Bild in deiner Story.
            </DialogDescription>
          </DialogHeader>

          {/* 9:16-Rahmen — reserviert den Platz, damit der Dialog beim Laden
              nicht springt. */}
          <div className="relative mx-auto w-full max-w-[260px] overflow-hidden rounded-2xl bg-brand-night-navy aspect-[9/16]">
            {!loaded && !failed && (
              <div
                className="absolute inset-0 flex items-center justify-center"
                aria-live="polite"
              >
                <Loader2 className="h-6 w-6 animate-spin text-white/60" aria-hidden />
                <span className="sr-only">Vorschau wird geladen…</span>
              </div>
            )}
            {failed ? (
              <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-white/70">
                Vorschau konnte nicht geladen werden.
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt="Vorschau der Story zu diesem Spiel"
                className="h-full w-full object-contain"
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
              />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="accent"
              size="lg"
              disabled={sharing || failed}
              onClick={() => void shareToInsta()}
            >
              {sharing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <span className="mr-2" aria-hidden>
                  📲
                </span>
              )}
              Auf Instagram teilen
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={sharing || failed}
              onClick={() => void share()}
            >
              <ImageDown className="mr-2 h-4 w-4" aria-hidden />
              Anders teilen / sichern
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
