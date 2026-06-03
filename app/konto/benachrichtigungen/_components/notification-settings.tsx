"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  updateNotificationSettings,
  type NotificationSettingsInput
} from "@/lib/actions/notifications";
import { PushEnableCard } from "./push-enable-card";

type Key = keyof NotificationSettingsInput;

const ROWS: { key: Key; label: string; hint: string }[] = [
  {
    key: "matchResults",
    label: "Spielergebnisse",
    hint: "Neues Ergebnis einer Mannschaft, die du verfolgst oder sponserst."
  },
  {
    key: "accessRequests",
    label: "Zugriffs-Anfragen",
    hint: "Jemand möchte deinem Verein / deiner Mannschaft beitreten. (Nur für Admins.)"
  },
  {
    key: "sponsorRequests",
    label: "Sponsoring-Anfragen",
    hint: "Neue Sponsor-Anfrage oder -Lead für eine deiner Mannschaften. (Nur für Admins.)"
  },
  {
    key: "billing",
    label: "Rechnung & Abo",
    hint: "Neue Rechnung erstellt, Testphase läuft aus."
  }
];

export function NotificationSettings({ initial }: { initial: NotificationSettingsInput }) {
  const [settings, setSettings] = useState<NotificationSettingsInput>(initial);
  const [pending, startTransition] = useTransition();

  function toggle(key: Key) {
    const next = { ...settings, [key]: !settings[key] };
    const prev = settings;
    setSettings(next); // optimistisch
    startTransition(async () => {
      const res = await updateNotificationSettings(next);
      if ("error" in res) {
        setSettings(prev); // revert
        toast.error(res.error);
      } else {
        toast.success("Gespeichert ✓");
      }
    });
  }

  return (
    <section className="rounded-2xl border border-brand-neutral/40 bg-white p-5 md:p-6 space-y-4">
      <div>
        <h2 className="font-display font-bold text-lg md:text-xl tracking-tight text-brand-night-navy">
          Push-Benachrichtigungen
        </h2>
        <p className="mt-0.5 text-xs text-brand-night-navy/60">
          Steuert die nativen Push-Mitteilungen in der KickPact-App (iOS). Im
          Browser siehst du alle Ereignisse weiterhin in der Liste unten.
        </p>
      </div>

      {/* Rationale-first Freischaltung (nur in der iOS-App sichtbar). */}
      <PushEnableCard />

      <ul className="divide-y divide-brand-neutral/30">
        {ROWS.map((row) => (
          <li key={row.key} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-brand-night-navy">{row.label}</p>
              <p className="mt-0.5 text-xs text-brand-night-navy/55">{row.hint}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings[row.key]}
              aria-label={row.label}
              disabled={pending}
              onClick={() => toggle(row.key)}
              className={[
                "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
                settings[row.key] ? "bg-accent" : "bg-brand-neutral/60"
              ].join(" ")}
            >
              <span
                className={[
                  "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform",
                  settings[row.key] ? "translate-x-5" : "translate-x-0"
                ].join(" ")}
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
