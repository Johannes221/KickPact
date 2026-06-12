"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  confirmSeasonRenewal,
  declineSeasonRenewal
} from "@/lib/actions/season-renewal";
import { saisonLabel } from "@/lib/utils/saison";

interface Props {
  token: string;
  nextSaison: string;
  nextSeasonTeamExists: boolean;
  alreadyCloned: boolean;
  initialAction?: "renew" | "decline";
}

type State =
  | { kind: "idle" }
  | { kind: "renewed"; targetSaison: string }
  | { kind: "declined" }
  | { kind: "error"; msg: string };

export function RenewalChoice({
  token,
  nextSaison,
  nextSeasonTeamExists,
  alreadyCloned,
  initialAction
}: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const [autoTriggered, setAutoTriggered] = useState(false);
  // W1.4: Saison-Codes ("2627") nie roh rendern — immer lesbares Label.
  const nextSaisonLabel = saisonLabel(nextSaison);

  function handleRenew() {
    startTransition(async () => {
      const res = await confirmSeasonRenewal(token);
      if (!res.ok) {
        setState({ kind: "error", msg: res.error });
        return;
      }
      setState({ kind: "renewed", targetSaison: res.targetSaison });
    });
  }

  function handleDecline() {
    startTransition(async () => {
      const res = await declineSeasonRenewal(token);
      if (!res.ok) {
        setState({ kind: "error", msg: res.error });
        return;
      }
      setState({ kind: "declined" });
    });
  }

  // Auto-trigger wenn der initialAction (aus ?action=…) gesetzt ist und der
  // User noch nichts gemacht hat. Verhindert den Doppel-Klick (Button-Click
  // in der Mail → kommt schon mit der Intention).
  useEffect(() => {
    if (!initialAction || autoTriggered || alreadyCloned) return;
    setAutoTriggered(true);
    if (initialAction === "renew") handleRenew();
    else if (initialAction === "decline") handleDecline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAction, autoTriggered, alreadyCloned]);

  if (alreadyCloned) {
    return (
      <div className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
        Dein Pact wurde bereits auf die Saison <strong>{nextSaisonLabel}</strong>{" "}
        verlängert. Du musst nichts weiter tun.
      </div>
    );
  }

  if (state.kind === "renewed") {
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          <strong>Verlängert!</strong> Dein Pact läuft nahtlos in die Saison{" "}
          <strong>{saisonLabel(state.targetSaison)}</strong>.
        </div>
        <p className="text-sm text-brand-night-navy/60">
          Du bekommst eine Bestätigungs-Mail mit allen Details. In deinem
          Sponsor-Dashboard kannst du jederzeit Trigger anpassen.
        </p>
      </div>
    );
  }

  if (state.kind === "declined") {
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-4 text-sm text-brand-night-navy/80">
          <strong>Verstanden.</strong> Dein Pact läuft regulär zum
          Saisonende aus. Wir schicken dir dann eine Übersicht aller Beiträge
          dieser Saison.
        </div>
        <p className="text-sm text-brand-night-navy/60">
          Du kannst jederzeit später wieder neu starten — einfach im
          Sponsor-Dashboard einen neuen Pact für die Saison{" "}
          <strong>{nextSaisonLabel}</strong> abschließen.
        </p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-4 text-sm text-brand-alert-red">
          {state.msg}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setState({ kind: "idle" })}
        >
          Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      {!nextSeasonTeamExists && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Achtung:</strong> Der Verein hat die Mannschaft für Saison{" "}
          <strong>{nextSaisonLabel}</strong> noch nicht angelegt. Wenn du jetzt
          verlängerst, scheitert die Aktion. Bitte warte auf Bescheid vom
          Verein oder antworte später.
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Button
          variant="accent"
          size="lg"
          onClick={handleRenew}
          disabled={pending || !nextSeasonTeamExists}
        >
          {pending ? "Verlängere…" : `Ja, auf Saison ${nextSaisonLabel} verlängern`}
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={handleDecline}
          disabled={pending}
        >
          Nein, danke
        </Button>
      </div>
    </div>
  );
}
