"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
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
  Inbox,
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
import { markAllNotificationsReadAction } from "@/lib/actions/notifications";
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

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAtIso: string;
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} Min`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std`;
  const d = Math.round(h / 24);
  if (d < 7) return `vor ${d} ${d === 1 ? "Tag" : "Tagen"}`;
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}

/**
 * Zentrale Benachrichtigungs-Glocke der nativen App-Bar (links). Bündelt
 *  - Status-Hinweise (Verifizierung / Trial / Zahlung) aus dem Layout-Kontext,
 *  - Event-Benachrichtigungen (neue Sponsoranfrage, neues Spiel, Zugriffs-
 *    anfrage …) aus dem persistenten Notifications-System.
 * Badge = offene Hinweise + ungelesene Events. Beim Öffnen werden Events als
 * gelesen markiert.
 */
export function NotificationsBell() {
  const statusItems = useStatusItems();
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/user/notifications", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setNotifs(Array.isArray(d.items) ? d.items : []);
        setUnread(typeof d.unreadCount === "number" ? d.unreadCount : 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const badge = statusItems.length + unread;

  async function handleOpenChange(v: boolean) {
    setOpen(v);
    if (v && unread > 0) {
      setUnread(0);
      setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
      try {
        await markAllNotificationsReadAction();
      } catch {
        /* best-effort */
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        aria-label={badge > 0 ? `Benachrichtigungen (${badge})` : "Benachrichtigungen"}
        className="relative -ml-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full text-accent transition-colors active:bg-brand-off-white"
      >
        <Bell className="h-[1.4rem] w-[1.4rem]" strokeWidth={2} aria-hidden />
        {badge > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-brand-alert-red px-1 text-[0.6rem] font-bold leading-none text-white ring-2 ring-white">
            {badge > 9 ? "9+" : badge}
          </span>
        ) : null}
      </button>

      <NotificationsSheet
        open={open}
        onOpenChange={handleOpenChange}
        statusItems={statusItems}
        notifs={notifs}
      />
    </>
  );
}

function NotificationsSheet({
  open,
  onOpenChange,
  statusItems,
  notifs
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  statusItems: StatusItem[];
  notifs: Notif[];
}) {
  const empty = statusItems.length === 0 && notifs.length === 0;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="native-font max-h-[88vh] overflow-y-auto rounded-t-3xl border-brand-neutral/30 bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
      >
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-brand-neutral/40" aria-hidden />
        <SheetHeader className="px-1">
          <SheetTitle className="text-left text-lg font-bold text-brand-night-navy">
            Benachrichtigungen
          </SheetTitle>
        </SheetHeader>

        {empty ? (
          <div className="mt-6 flex flex-col items-center gap-2 py-8 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-accent/10 text-accent-dark">
              <Check className="h-6 w-6" aria-hidden />
            </span>
            <p className="text-sm font-medium text-brand-night-navy">Alles erledigt</p>
            <p className="text-xs text-brand-night-navy/50">Nichts Neues für dich.</p>
          </div>
        ) : (
          <>
            {statusItems.length > 0 && (
              <section className="mt-3">
                <SectionLabel>Hinweise</SectionLabel>
                <ul className="space-y-2">
                  {statusItems.map((it) => (
                    <li key={it.id}>
                      <StatusRow item={it} onNavigate={() => onOpenChange(false)} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {notifs.length > 0 && (
              <section className="mt-4">
                <SectionLabel>Aktivität</SectionLabel>
                <ul className="space-y-1.5">
                  {notifs.map((n) => (
                    <li key={n.id}>
                      <NotifRow notif={n} onNavigate={() => onOpenChange(false)} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-1 pb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-brand-night-navy/45">
      {children}
    </div>
  );
}

function StatusRow({ item, onNavigate }: { item: StatusItem; onNavigate: () => void }) {
  const Icon = ICONS[item.iconKey];
  const body = (
    <div className="flex items-start gap-3 rounded-2xl bg-white p-3.5 shadow-ios-card">
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", TONE_ICON[item.tone])}>
        <Icon className="h-[1.15rem] w-[1.15rem]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold leading-snug text-brand-night-navy">{item.title}</p>
        {item.detail ? (
          <p className="mt-0.5 text-[13px] leading-snug text-brand-night-navy/60">{item.detail}</p>
        ) : null}
        {item.actionLabel ? (
          <span className="mt-1.5 inline-flex items-center gap-0.5 text-[13px] font-semibold text-accent-dark">
            {item.actionLabel}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        ) : null}
      </div>
    </div>
  );
  return item.actionHref ? (
    <Link href={item.actionHref} onClick={onNavigate} className="block transition-opacity active:opacity-70">
      {body}
    </Link>
  ) : (
    body
  );
}

function NotifRow({ notif, onNavigate }: { notif: Notif; onNavigate: () => void }) {
  const body = (
    <div className="flex items-start gap-3 rounded-2xl bg-white p-3.5 shadow-ios-card">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-off-white text-brand-night-navy/70">
        <Inbox className="h-[1.1rem] w-[1.1rem]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-brand-night-navy">
            {notif.title}
          </p>
          {!notif.read ? (
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="ungelesen" />
          ) : null}
        </div>
        {notif.body ? (
          <p className="mt-0.5 text-[13px] leading-snug text-brand-night-navy/60">{notif.body}</p>
        ) : null}
        <p className="mt-1 text-[11px] text-brand-night-navy/40">{relTime(notif.createdAtIso)}</p>
      </div>
    </div>
  );
  return notif.link ? (
    <Link href={notif.link} onClick={onNavigate} className="block transition-opacity active:opacity-70">
      {body}
    </Link>
  ) : (
    body
  );
}
