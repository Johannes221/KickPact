"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bell,
  ChevronRight,
  ShieldAlert,
  ShieldCheck,
  Hourglass,
  Clock,
  Lock,
  Gem,
  Check,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { useStatusItems } from "./status-context";
import type { StatusItem, StatusIconKey, StatusTone } from "./status-bar";

const ICONS: Record<StatusIconKey, LucideIcon> = {
  "shield-alert": ShieldAlert,
  "shield-check": ShieldCheck,
  hourglass: Hourglass,
  clock: Clock,
  lock: Lock,
  gem: Gem
};

const TONE_ICON: Record<StatusTone, string> = {
  info: "bg-accent/10 text-accent-dark",
  warn: "bg-amber-100 text-amber-700",
  danger: "bg-brand-alert-red/10 text-brand-alert-red"
};

/**
 * Glocke für die native App-Bar (links). Zeigt einen Badge mit der Anzahl
 * offener Hinweise (Verifizierung / Trial / Zahlung) und öffnet ein
 * Bottom-Sheet mit den Details. Ersetzt die früher inline gerenderte
 * „HINWEISE"-Karte auf der nativen Shell.
 */
export function NotificationsBell() {
  const items = useStatusItems();
  const [open, setOpen] = useState(false);
  const count = items.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={
          count > 0 ? `Benachrichtigungen (${count})` : "Benachrichtigungen"
        }
        className="relative -ml-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-accent transition-colors active:bg-brand-off-white"
      >
        <Bell className="h-[1.4rem] w-[1.4rem]" strokeWidth={2} aria-hidden />
        {count > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-brand-alert-red px-1 text-[0.6rem] font-bold leading-none text-white ring-2 ring-white">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </button>

      <NotificationsSheet open={open} onOpenChange={setOpen} items={items} />
    </>
  );
}

function NotificationsSheet({
  open,
  onOpenChange,
  items
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: StatusItem[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="native-font max-h-[88vh] overflow-y-auto rounded-t-3xl border-brand-neutral/30 bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
      >
        <div
          className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-brand-neutral/40"
          aria-hidden
        />
        <SheetHeader className="px-1">
          <SheetTitle className="text-left text-lg font-bold text-brand-night-navy">
            Benachrichtigungen
          </SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-2 py-8 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-accent-dark">
              <Check className="h-6 w-6" aria-hidden />
            </span>
            <p className="text-sm font-medium text-brand-night-navy">
              Alles erledigt
            </p>
            <p className="text-xs text-brand-night-navy/50">
              Keine offenen Hinweise.
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {items.map((it) => {
              const Icon = ICONS[it.iconKey];
              const body = (
                <div className="flex items-start gap-3 rounded-2xl bg-white p-3.5 shadow-ios-card">
                  <span
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-full",
                      TONE_ICON[it.tone]
                    )}
                  >
                    <Icon className="h-[1.15rem] w-[1.15rem]" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold leading-snug text-brand-night-navy">
                      {it.title}
                    </p>
                    {it.detail ? (
                      <p className="mt-0.5 text-[13px] leading-snug text-brand-night-navy/60">
                        {it.detail}
                      </p>
                    ) : null}
                    {it.actionLabel ? (
                      <span className="mt-1.5 inline-flex items-center gap-0.5 text-[13px] font-semibold text-accent-dark">
                        {it.actionLabel}
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    ) : null}
                  </div>
                </div>
              );
              return (
                <li key={it.id}>
                  {it.actionHref ? (
                    <Link
                      href={it.actionHref}
                      onClick={() => onOpenChange(false)}
                      className="block transition-opacity active:opacity-70"
                    >
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
