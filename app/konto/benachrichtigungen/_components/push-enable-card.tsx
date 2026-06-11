"use client";
import { Button } from "@/components/ui/button";

import { useEffect, useState } from "react";
import { Bell, BellRing, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  enablePushNotifications,
  getPushPermission,
  type PushPermission
} from "@/lib/platform/push";

/**
 * Rationale-first Push-Freischaltung. Native-only: im Browser rendert die
 * Komponente nichts (Status „unsupported"). Statt den iOS-System-Dialog beim
 * App-Start zu erzwingen, erklärt diese Karte den Nutzen und löst den Dialog
 * erst beim bewussten Tippen auf „Aktivieren" aus.
 */
export function PushEnableCard() {
  const [status, setStatus] = useState<PushPermission | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void getPushPermission().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Noch ladend oder kein nativer Kontext → nichts anzeigen.
  if (status === null || status === "unsupported") return null;

  async function activate() {
    setBusy(true);
    try {
      const next = await enablePushNotifications();
      setStatus(next);
      if (next === "granted") {
        toast.success("Push aktiviert ✓");
      } else if (next === "denied") {
        toast.error("In den iOS-Einstellungen freigeben.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (status === "granted") {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-accent/30 bg-accent/5 px-3.5 py-3 text-sm">
        <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden />
        <span className="font-medium text-brand-night-navy">
          Push-Benachrichtigungen sind aktiviert.
        </span>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-3.5 py-3 text-sm">
        <div className="flex items-center gap-2 font-semibold text-amber-900">
          <Bell className="h-4 w-4 shrink-0" aria-hidden />
          Push ist in iOS deaktiviert
        </div>
        <p className="mt-1 text-xs text-amber-800/90">
          Öffne <strong>Einstellungen → KickPact → Mitteilungen</strong> und
          erlaube Mitteilungen, um Spielergebnisse & Co. sofort zu erhalten.
        </p>
      </div>
    );
  }

  // status === "prompt": Pre-Prompt mit Nutzen-Erklärung + bewusstem Opt-in.
  return (
    <div className="rounded-xl border border-accent/30 bg-gradient-to-br from-accent/5 to-transparent px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
          <BellRing className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-brand-night-navy">
            Verpass kein Spiel
          </p>
          <p className="mt-0.5 text-xs text-brand-night-navy/65">
            Sofort Bescheid bei neuen Spielergebnissen, Sponsoring- und
            Zugriffs-Anfragen sowie neuen Rechnungen. Du steuerst unten genau,
            was du bekommst.
          </p>
          <Button
            variant="accent"
            size="sm"
            className="mt-3"
            onClick={activate}
            disabled={busy}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <BellRing className="h-4 w-4" aria-hidden />
            )}
            Benachrichtigungen aktivieren
          </Button>
        </div>
      </div>
    </div>
  );
}
