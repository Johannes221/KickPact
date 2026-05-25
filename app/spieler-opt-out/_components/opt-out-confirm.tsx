"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { confirmPlayerOptOut } from "@/lib/actions/team-lifecycle";

interface Props {
  token: string;
  playerName: string;
  teamName: string;
  clubName: string;
}

type State =
  | { kind: "idle" }
  | { kind: "confirmed" }
  | { kind: "error"; msg: string };

export function OptOutConfirm({ token, playerName, teamName, clubName }: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const res = await confirmPlayerOptOut(token);
      if (!res.ok) {
        setState({ kind: "error", msg: res.error });
        return;
      }
      setState({ kind: "confirmed" });
    });
  }

  if (state.kind === "confirmed") {
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          <strong>Du bist anonymisiert.</strong> Dein Name erscheint in
          KickPact ab sofort als „Anonymisiert" und der Crawler ignoriert
          Updates zu dir.
        </div>
        <p className="text-sm text-brand-night-navy/60">
          Falls du es dir anders überlegst: kontaktiere{" "}
          <strong>{clubName}</strong> direkt — wir speichern keine Kontaktdaten
          der Spieler.
        </p>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="mt-6 rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-4 text-sm text-brand-alert-red">
        {state.msg}
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-lg border border-brand-neutral/40 bg-white p-4 space-y-2">
        <div className="text-xs uppercase tracking-widest text-brand-night-navy/50 font-semibold">
          Bestätigung
        </div>
        <p className="text-sm text-brand-night-navy">
          Du wirst aus der Auflistung der Mannschaft{" "}
          <strong>{teamName}</strong> ({clubName}) entfernt.
        </p>
        <p className="text-sm text-brand-night-navy/70">
          Dein bisheriger Eintrag ist „<strong>{playerName}</strong>". Nach
          Bestätigung erscheint er als „Anonymisiert" und der Crawler
          ignoriert künftige Updates.
        </p>
      </div>

      <p className="text-sm text-brand-night-navy/60">
        Bist du sicher?
      </p>

      <div className="flex gap-3">
        <Button
          variant="accent"
          size="lg"
          onClick={handleConfirm}
          disabled={pending}
        >
          {pending ? "Bestätige…" : "Ja, anonymisieren"}
        </Button>
        <Button
          variant="ghost"
          size="lg"
          onClick={() => window.history.back()}
          disabled={pending}
        >
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
