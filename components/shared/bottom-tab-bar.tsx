"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";

export interface BottomTabItem {
  label: string;
  emoji: string;
  /** Absolute URL (inkl. Base-Pfad). */
  href: string;
  /** Optionaler Counter (z.B. offene Inbox-Items) → Badge auf dem Icon. */
  badge?: number;
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-1 right-1 min-w-[16px] h-[16px] rounded-full bg-accent text-white text-[0.55rem] font-bold flex items-center justify-center px-1 leading-none">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Mobile Bottom-Tab-Bar (native-App-Gefühl). Nur auf Mobile sichtbar
 * (`md:hidden`), fest am unteren Rand inkl. Safe-Area. Zeigt bis zu 4 primäre
 * Tabs; gibt es mehr, landet der Rest hinter einem "Mehr"-Eintrag in einem
 * Bottom-Sheet. Aktiv-Erkennung via längstem Pfad-Präfix.
 *
 * Wird pro Kontext (Mannschaft / Verein / Sponsor) mit den jeweiligen Items
 * gerendert; der zugehörige Desktop-Tab-Streifen bleibt davon unberührt.
 */
export function BottomTabBar({
  items,
  contextLabel
}: {
  items: BottomTabItem[];
  contextLabel?: string;
}) {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  // Aktiven Eintrag über längstes passendes Präfix bestimmen.
  const activeHref = items.reduce<string | null>((best, it) => {
    if (!isActive(it.href)) return best;
    if (!best || it.href.length > best.length) return it.href;
    return best;
  }, null);

  const needsMore = items.length > 5;
  const primary = needsMore ? items.slice(0, 4) : items;
  const overflow = needsMore ? items.slice(4) : [];
  const overflowActive = overflow.some((it) => it.href === activeHref);
  const overflowBadge = overflow.reduce((s, it) => s + (it.badge ?? 0), 0);
  const cols = primary.length + (needsMore ? 1 : 0);

  return (
    <nav
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-brand-neutral/40 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      aria-label={contextLabel ?? "Navigation"}
    >
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {primary.map((it) => {
          const active = it.href === activeHref;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-2 text-[0.65rem] font-semibold transition-colors",
                active
                  ? "text-accent-dark"
                  : "text-brand-night-navy/55 hover:text-brand-night-navy"
              )}
            >
              <span className="relative text-lg leading-none" aria-hidden>
                {it.emoji}
                {it.badge ? <Badge count={it.badge} /> : null}
              </span>
              <span className="truncate max-w-full px-1">{it.label}</span>
            </Link>
          );
        })}

        {needsMore && (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2 text-[0.65rem] font-semibold transition-colors",
                  overflowActive
                    ? "text-accent-dark"
                    : "text-brand-night-navy/55 hover:text-brand-night-navy"
                )}
                aria-label="Mehr"
              >
                <span className="relative text-lg leading-none" aria-hidden>
                  ⋯
                  {overflowBadge > 0 ? <Badge count={overflowBadge} /> : null}
                </span>
                <span>Mehr</span>
              </button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="bg-white pb-[env(safe-area-inset-bottom)]"
            >
              <SheetHeader>
                <SheetTitle className="text-left">Mehr</SheetTitle>
              </SheetHeader>
              <nav className="mt-4 grid grid-cols-2 gap-2">
                {overflow.map((it) => {
                  const active = it.href === activeHref;
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors",
                        active
                          ? "border-accent/40 bg-accent/10 text-accent-dark"
                          : "border-brand-neutral/40 text-brand-night-navy hover:bg-brand-off-white"
                      )}
                    >
                      <span className="relative text-xl" aria-hidden>
                        {it.emoji}
                        {it.badge ? <Badge count={it.badge} /> : null}
                      </span>
                      {it.label}
                    </Link>
                  );
                })}
              </nav>
            </SheetContent>
          </Sheet>
        )}
      </div>
    </nav>
  );
}
