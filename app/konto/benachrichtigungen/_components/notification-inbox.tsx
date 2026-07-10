"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction
} from "@/lib/actions/notifications";

export interface InboxItem {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAtIso: string;
}

/**
 * Stabiler, deterministischer Zeitstempel für SSR + Erstpaint — feste
 * timeZone, KEIN Date.now(). Server- und Client-Markup sind identisch (kein
 * Hydration-#418). Nach dem Mount ersetzt `relativeTime` diesen Wert clientseitig.
 */
function absoluteTime(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Berlin"
  });
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMin = Math.round((Date.now() - then) / 60000);
  if (diffMin < 1) return "gerade eben";
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `vor ${diffH} Std.`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `vor ${diffD} Tg.`;
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

export function NotificationInbox({ initial }: { initial: InboxItem[] }) {
  const [items, setItems] = useState<InboxItem[]>(initial);
  const [pending, startTransition] = useTransition();
  // #418-Guard: relative Zeit (Date.now()) erst nach dem Mount rendern.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const router = useRouter();
  const hasUnread = items.some((i) => !i.read);

  function open(item: InboxItem) {
    if (!item.read) {
      const prev = items;
      setItems((p) => p.map((i) => (i.id === item.id ? { ...i, read: true } : i)));
      startTransition(async () => {
        try {
          await markNotificationReadAction(item.id);
        } catch {
          // Fehler → optimistischen Read-Status zurückrollen (kein stilles Scheitern).
          setItems(prev);
          toast.error("Konnte nicht als gelesen markieren.");
        }
      });
    }
    if (item.link) router.push(item.link);
  }

  function markAll() {
    const prev = items;
    setItems((p) => p.map((i) => ({ ...i, read: true })));
    startTransition(async () => {
      try {
        await markAllNotificationsReadAction();
        toast.success("Alle als gelesen markiert");
      } catch {
        setItems(prev);
        toast.error("Konnte nicht markieren — bitte erneut versuchen.");
      }
    });
  }

  return (
    <section className="rounded-2xl bg-white shadow-ios-card p-5 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display font-bold text-lg md:text-xl tracking-tight text-brand-night-navy">
          Verlauf
        </h2>
        {hasUnread && (
          <button
            type="button"
            onClick={markAll}
            disabled={pending}
            className="text-xs font-semibold text-accent underline disabled:opacity-50"
          >
            Alle als gelesen
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-brand-night-navy/55">
          Noch keine Benachrichtigungen.
        </p>
      ) : (
        <ul className="divide-y divide-brand-neutral/30">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => open(item)}
                className="flex w-full items-start gap-3 py-3 text-left transition-colors hover:bg-brand-off-white/60 rounded-lg px-2 -mx-2"
              >
                <span
                  aria-hidden
                  className={[
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    item.read ? "bg-transparent" : "bg-accent"
                  ].join(" ")}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span
                      className={[
                        "truncate text-sm",
                        item.read
                          ? "font-medium text-brand-night-navy/80"
                          : "font-bold text-brand-night-navy"
                      ].join(" ")}
                    >
                      {item.title}
                    </span>
                    <span className="shrink-0 text-[0.7rem] text-brand-night-navy/45">
                      {mounted
                        ? relativeTime(item.createdAtIso)
                        : absoluteTime(item.createdAtIso)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-brand-night-navy/60">
                    {item.body}
                  </span>
                </span>
                {item.link && (
                  <span aria-hidden className="mt-0.5 shrink-0 text-brand-night-navy/30">
                    →
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
