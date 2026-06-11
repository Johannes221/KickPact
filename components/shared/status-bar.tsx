"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  X,
  ShieldAlert,
  ShieldCheck,
  Hourglass,
  Clock,
  Lock,
  Gem,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusTone = "info" | "warn" | "danger";
export type StatusIconKey =
  | "shield-alert"
  | "shield-check"
  | "hourglass"
  | "clock"
  | "lock"
  | "gem";

/** Serialisierbares Status-Item — wird vom Server-Layout befüllt. */
export interface StatusItem {
  id: string;
  tone: StatusTone;
  iconKey: StatusIconKey;
  title: string;
  detail?: string;
  actionLabel?: string;
  actionHref?: string;
}

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

const TONE_RANK: Record<StatusTone, number> = { info: 0, warn: 1, danger: 2 };

const DISMISS_KEY = "kp_status_dismissed_until";
const COLLAPSE_KEY = "kp_status_collapsed";
const HAS_ITEMS_KEY = "kp_status_has_items";
/** Tab-lokales Event: StatusBar ↔ HeaderStatusDot synchron halten. */
const STATUS_EVENT = "kp-status-change";
const DISMISS_DAYS = 3;

function emitStatusChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(STATUS_EVENT));
  }
}

/**
 * Kompaktes, gebündeltes Status-Element für Trial / Verifizierung / Zahlung.
 * Ersetzt die früheren großflächigen Einzel-Banner.
 *
 * - Default: kompakte weiße Karte mit je einer Zeile pro Hinweis.
 * - Kollabierbar zu einer 1-zeiligen Leiste (Zustand in localStorage gemerkt).
 * - Wegklickbar (×) → verschwindet für {DISMISS_DAYS} Tage, taucht dann erneut auf.
 * - `danger`-Items (dringend, z.B. Read-Only / Trial ≤ 3 Tage) ignorieren den
 *   Dismiss und bleiben immer sichtbar.
 *
 * SSR-sicher: erster Client-Render entspricht dem Server-Render (expandiert),
 * localStorage-Präferenzen werden erst nach dem Mount angewandt.
 */
export function StatusBar({ items }: { items: StatusItem[] }) {
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
      const until = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      setDismissed(Date.now() < until);
    } catch {
      /* localStorage kann in Privat-Modi werfen — dann Default (sichtbar). */
    }
  }, []);

  // Spiegelt "es gibt offene Hinweise" nach localStorage, damit der
  // HeaderStatusDot (anderer Baum) den Punkt zeigen kann, wenn weggeklickt wurde.
  useEffect(() => {
    try {
      if (items.length > 0) localStorage.setItem(HAS_ITEMS_KEY, "1");
      else localStorage.removeItem(HAS_ITEMS_KEY);
    } catch {
      /* ignore */
    }
    emitStatusChange();
  }, [items.length]);

  if (items.length === 0) return null;

  const hasDanger = items.some((i) => i.tone === "danger");
  const topTone = items.reduce<StatusTone>(
    (acc, i) => (TONE_RANK[i.tone] > TONE_RANK[acc] ? i.tone : acc),
    "info"
  );

  // Weggeklickt (und nichts Dringendes offen) → nichts rendern.
  if (mounted && dismissed && !hasDanger) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(
        DISMISS_KEY,
        String(Date.now() + DISMISS_DAYS * 86_400_000)
      );
    } catch {
      /* ignore */
    }
    setDismissed(true);
    emitStatusChange();
  };

  const setCollapse = (next: boolean) => {
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    setCollapsed(next);
  };

  // ── Kollabierte 1-Zeilen-Leiste ────────────────────────────────────────────
  if (mounted && collapsed) {
    const primary = [...items].sort(
      (a, b) => TONE_RANK[b.tone] - TONE_RANK[a.tone]
    )[0];
    const Icon = ICONS[primary.iconKey];
    const extra = items.length - 1;
    return (
      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-white shadow-ios-card px-3 py-2">
        <button
          type="button"
          onClick={() => setCollapse(false)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          aria-label="Status-Hinweise aufklappen"
        >
          <span
            className={cn(
              "grid h-7 w-7 shrink-0 place-items-center rounded-full",
              TONE_ICON[primary.tone]
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <span className="truncate text-sm font-semibold text-brand-night-navy">
            {primary.title}
          </span>
          {extra > 0 && (
            <span className="shrink-0 rounded-full bg-brand-night-navy/5 px-1.5 py-0.5 text-[0.65rem] font-bold text-brand-night-navy/60">
              +{extra}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setCollapse(false)}
          className="shrink-0 rounded-full p-1.5 text-brand-night-navy/60 transition-colors hover:bg-brand-off-white hover:text-brand-night-navy"
          aria-label="Aufklappen"
        >
          <ChevronDown className="h-4 w-4" aria-hidden />
        </button>
      </div>
    );
  }

  // ── Expandierte Karte ───────────────────────────────────────────────────────
  return (
    <section
      aria-label="Status-Hinweise"
      className={cn(
        "mb-4 overflow-hidden rounded-2xl border bg-white shadow-ios-card",
        topTone === "danger"
          ? "border-brand-alert-red/30"
          : topTone === "warn"
            ? "border-amber-300/70"
            : "border-brand-neutral/40"
      )}
    >
      <div className="flex items-center gap-2 px-3.5 pt-2.5">
        <span className="text-[0.65rem] font-bold uppercase tracking-widest text-brand-night-navy/60">
          Hinweise
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => setCollapse(true)}
          className="rounded-full p-1.5 text-brand-night-navy/60 transition-colors hover:bg-brand-off-white hover:text-brand-night-navy"
          aria-label="Einklappen"
        >
          <ChevronDown className="h-4 w-4 rotate-180" aria-hidden />
        </button>
        {!hasDanger && (
          <button
            type="button"
            onClick={dismiss}
            className="rounded-full p-1.5 text-brand-night-navy/60 transition-colors hover:bg-brand-off-white hover:text-brand-night-navy"
            aria-label="Hinweise ausblenden"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      <ul className="px-1.5 pb-1.5">
        {items.map((item) => {
          const Icon = ICONS[item.iconKey];
          const inner = (
            <>
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-full",
                  TONE_ICON[item.tone]
                )}
              >
                <Icon className="h-[1.15rem] w-[1.15rem]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-brand-night-navy">
                  {item.title}
                </span>
                {item.detail && (
                  <span className="mt-0.5 block text-xs leading-snug text-brand-night-navy/60">
                    {item.detail}
                  </span>
                )}
              </span>
              {item.actionHref && (
                <span className="flex shrink-0 items-center gap-0.5 self-center text-xs font-semibold text-accent-dark">
                  {item.actionLabel}
                  <ChevronRight className="h-4 w-4" aria-hidden />
                </span>
              )}
            </>
          );
          return (
            <li key={item.id}>
              {item.actionHref ? (
                <Link
                  href={item.actionHref}
                  className="flex items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-brand-off-white"
                >
                  {inner}
                </Link>
              ) : (
                <div className="flex items-start gap-3 px-2 py-2">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Kleiner roter Hinweis-Punkt (z.B. am Avatar), der erscheint, wenn die
 * StatusBar weggeklickt wurde, aber noch offene Hinweise existieren. Liest die
 * von der StatusBar gesetzten localStorage-Flags und aktualisiert sich tab-lokal
 * über das `kp-status-change`-Event (localStorage-Writes feuern im selben Tab
 * kein natives `storage`-Event).
 */
export function HeaderStatusDot() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        const until = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
        const hasItems = localStorage.getItem(HAS_ITEMS_KEY) === "1";
        setShow(hasItems && Date.now() < until);
      } catch {
        setShow(false);
      }
    };
    read();
    window.addEventListener(STATUS_EVENT, read);
    window.addEventListener("focus", read);
    return () => {
      window.removeEventListener(STATUS_EVENT, read);
      window.removeEventListener("focus", read);
    };
  }, []);

  if (!show) return null;
  return (
    <span
      className="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-brand-alert-red ring-2 ring-white"
      aria-label="Offene Hinweise"
    />
  );
}
