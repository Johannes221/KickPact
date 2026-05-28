"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";

const TABS = [
  { label: "Dashboard", href: "", emoji: "🏟️" },
  { label: "Ereignisse", href: "/ereignisse", emoji: "⚽" },
  { label: "Sponsoren", href: "/sponsoren", emoji: "💚" },
  { label: "Pacts", href: "/pledges", emoji: "🎯" },
  { label: "Charges", href: "/charges", emoji: "📊" },
  { label: "Abrechnungen", href: "/abrechnungen", emoji: "📄" },
  { label: "Abo", href: "/abo", emoji: "💎" },
  { label: "Einstellungen", href: "/einstellungen", emoji: "⚙️" }
];

export function VereinSubNav({ slug, clubName }: { slug: string; clubName: string }) {
  const pathname = usePathname();
  const base = `/verein/${slug}`;
  const [open, setOpen] = useState(false);

  const activeTab = TABS.find(({ href }) => {
    const fullHref = `${base}${href}`;
    if (href === "") return pathname === base;
    return pathname === fullHref || pathname.startsWith(fullHref + "/");
  });

  return (
    <>
      {/* Desktop: horizontal tabs */}
      <nav className="hidden md:flex gap-1 rounded-2xl border border-brand-neutral/30 bg-brand-off-white p-1.5">
        {TABS.map(({ label, href }) => {
          const fullHref = `${base}${href}`;
          const isActive = activeTab?.href === href;
          return (
            <Link
              key={href}
              href={fullHref}
              className={cn(
                "shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap",
                isActive
                  ? "bg-white text-brand-night-navy shadow-sm ring-1 ring-brand-neutral/20"
                  : "text-brand-night-navy/60 hover:text-brand-night-navy hover:bg-white/70"
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile: burger trigger + drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            className="md:hidden flex items-center justify-between gap-3 w-full rounded-2xl border border-brand-neutral/40 bg-white px-4 py-3 text-left"
            aria-label="Vereins-Menü öffnen"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Menu className="h-5 w-5 text-brand-night-navy/60 shrink-0" />
              <span className="flex-1 min-w-0">
                <span className="block text-[0.65rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
                  {clubName}
                </span>
                <span className="block text-sm font-semibold text-brand-night-navy truncate">
                  {activeTab?.label ?? "Dashboard"}
                </span>
              </span>
            </span>
            <span className="text-brand-night-navy/40 text-xs" aria-hidden>▾</span>
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[85%] sm:w-[380px] bg-white">
          <SheetHeader>
            <SheetTitle className="text-left">
              <span className="block text-[0.65rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
                Verein
              </span>
              <span className="block font-display font-black text-xl tracking-tight text-brand-night-navy">
                {clubName}
              </span>
            </SheetTitle>
          </SheetHeader>
          <nav className="mt-6 flex flex-col gap-1">
            {TABS.map(({ label, href, emoji }) => {
              const fullHref = `${base}${href}`;
              const isActive = activeTab?.href === href;
              return (
                <Link
                  key={href}
                  href={fullHref}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-3 text-base font-semibold transition-colors",
                    isActive
                      ? "bg-accent/10 text-accent-dark"
                      : "text-brand-night-navy hover:bg-brand-off-white"
                  )}
                >
                  <span className="text-xl" aria-hidden>{emoji}</span>
                  {label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
