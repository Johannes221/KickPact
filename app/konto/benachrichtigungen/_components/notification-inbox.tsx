"use client";

import { useState, useTransition } from "react";
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
  const router = useRouter();
  const hasUnread = items.some((i) => !i.read);

  function open(item: InboxItem) {
    if (!item.read) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, read: true } : i)));
      startTransition(async () => {
        await markNotificationReadAction(item.id);
      });
    }
    if (item.link) router.push(item.link);
  }

  function markAll() {
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    startTransition(async () => {
      await markAllNotificationsReadAction();
      toast.success("Alle als gelesen markiert");
    });
  }

  return (
    <section className="rounded-2xl border border-brand-neutral/40 bg-white p-5 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display font-black text-lg md:text-xl tracking-tight text-brand-night-navy">
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
                      {relativeTime(item.createdAtIso)}
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
