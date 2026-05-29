"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
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
  /** Lucide-Icon-Komponente (kein Emoji). */
  icon: LucideIcon;
  /** Absolute URL (inkl. Base-Pfad). */
  href: string;
  /** Optionaler Counter (z.B. offene Inbox-Items) → Badge auf dem Icon. */
  badge?: number;
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1.5 -top-1 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-brand-alert-red px-1 text-[0.55rem] font-bold leading-none text-white ring-2 ring-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

/**
 * Mobile Bottom-Tab-Bar (native-iOS-Gefühl). Nur auf Mobile sichtbar
 * (`md:hidden`), fest am unteren Rand inkl. Safe-Area, Frosted-Glass-Hintergrund.
 * Zeigt bis zu 5 primäre Tabs; gibt es mehr, landet der Rest hinter einem
 * "Mehr"-Eintrag in einem Bottom-Sheet. Aktiv-Erkennung via längstem Pfad-Präfix;
 * der aktive Tab bekommt eine Akzent-Pille hinter dem Icon.
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
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-brand-neutral/30 bg-white/80 backdrop-blur-xl pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_16px_rgba(0,0,0,0.05)]"
      aria-label={contextLabel ?? "Navigation"}
    >
      <div
        className="grid"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {primary.map((it) => {
          const active = it.href === activeHref;
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? "page" : undefined}
              className="group flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 pt-1.5 pb-1"
            >
              <span
                className={cn(
                  "relative grid h-8 w-[3.25rem] place-items-center rounded-full transition-colors",
                  active && "bg-accent/12"
                )}
              >
                <Icon
                  className={cn(
                    "h-[1.35rem] w-[1.35rem] transition-transform duration-150 group-active:scale-90",
                    active
                      ? "text-accent-dark"
                      : "text-brand-night-navy/50 group-hover:text-brand-night-navy"
                  )}
                  strokeWidth={active ? 2.4 : 2}
                  aria-hidden
                />
                {it.badge ? <Badge count={it.badge} /> : null}
              </span>
              <span
                className={cn(
                  "max-w-full truncate px-1 text-[0.65rem] font-semibold transition-colors",
                  active ? "text-accent-dark" : "text-brand-night-navy/50"
                )}
              >
                {it.label}
              </span>
            </Link>
          );
        })}

        {needsMore && (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                className="group flex min-h-[3.25rem] flex-col items-center justify-center gap-0.5 pt-1.5 pb-1"
                aria-label="Mehr"
              >
                <span
                  className={cn(
                    "relative grid h-8 w-[3.25rem] place-items-center rounded-full transition-colors",
                    overflowActive && "bg-accent/12"
                  )}
                >
                  <MoreHorizontal
                    className={cn(
                      "h-[1.35rem] w-[1.35rem] transition-transform duration-150 group-active:scale-90",
                      overflowActive
                        ? "text-accent-dark"
                        : "text-brand-night-navy/50 group-hover:text-brand-night-navy"
                    )}
                    strokeWidth={overflowActive ? 2.4 : 2}
                    aria-hidden
                  />
                  {overflowBadge > 0 ? <Badge count={overflowBadge} /> : null}
                </span>
                <span
                  className={cn(
                    "text-[0.65rem] font-semibold transition-colors",
                    overflowActive ? "text-accent-dark" : "text-brand-night-navy/50"
                  )}
                >
                  Mehr
                </span>
              </button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="rounded-t-3xl border-brand-neutral/30 bg-white/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
            >
              <SheetHeader>
                <SheetTitle className="text-left font-display font-black tracking-tight">
                  Mehr
                </SheetTitle>
              </SheetHeader>
              <nav className="mt-4 grid grid-cols-2 gap-2">
                {overflow.map((it) => {
                  const active = it.href === activeHref;
                  const Icon = it.icon;
                  return (
                    <Link
                      key={it.href}
                      href={it.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-sm font-semibold transition-colors",
                        active
                          ? "border-accent/40 bg-accent/10 text-accent-dark"
                          : "border-brand-neutral/40 text-brand-night-navy hover:bg-brand-off-white"
                      )}
                    >
                      <span
                        className={cn(
                          "relative grid h-9 w-9 shrink-0 place-items-center rounded-full",
                          active
                            ? "bg-accent/15 text-accent-dark"
                            : "bg-brand-off-white text-brand-night-navy/70"
                        )}
                      >
                        <Icon className="h-[1.15rem] w-[1.15rem]" aria-hidden />
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
