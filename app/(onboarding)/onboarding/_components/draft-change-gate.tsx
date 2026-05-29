"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { discardDraftClub } from "../_actions/discard-draft";

interface Props {
  role: "mannschaft" | "verein";
  clubId: string;
  vereinName: string;
  teamCount: number;
}

/**
 * Wird im Verein-Step (Schritt 1) angezeigt, wenn der User per „← Zurück" aus
 * den Stammdaten zurückkommt und bereits einen Draft hat. Zwei Optionen:
 *
 *   1. „Weiter" → behält die aktuelle Wahl und springt zu den Stammdaten.
 *   2. „Anderen Verein wählen" → verwirft den Draft (discardDraftClub) und lädt
 *      die Seite neu → frische Vereinssuche erscheint (kein Doppel-Draft).
 */
export function DraftChangeGate({ role, clubId, vereinName, teamCount }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleWeiter() {
    router.push(`/onboarding/${role}/stammdaten`);
  }

  function handleChange() {
    startTransition(async () => {
      try {
        await discardDraftClub(clubId);
        // Ohne ?change → der Verein-Step rendert jetzt die frische Suche
        // (kein Draft mehr → kein Redirect, kein Gate).
        router.replace(`/onboarding/${role}/verein`);
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Konnte nicht zurücksetzen.";
        toast.error(msg);
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
        <div className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
          Aktuell gewählt
        </div>
        <div className="mt-1 font-display font-black text-xl md:text-2xl tracking-tight text-brand-night-navy">
          {vereinName}
        </div>
        <div className="mt-1 text-sm text-brand-night-navy/60">
          {teamCount} Mannschaft{teamCount === 1 ? "" : "en"} ausgewählt
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button variant="accent" size="lg" onClick={handleWeiter} disabled={pending}>
          Weiter mit {vereinName} →
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={handleChange}
          disabled={pending}
        >
          {pending ? "Setze zurück…" : "Anderen Verein wählen"}
        </Button>
      </div>

      <p className="text-xs text-brand-night-navy/50">
        „Anderen Verein wählen" verwirft deine aktuelle Auswahl. Eingegebene
        Stammdaten gehen dabei verloren.
      </p>
    </div>
  );
}
