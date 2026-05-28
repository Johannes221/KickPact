"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BottomTabBar } from "@/components/shared/bottom-tab-bar";

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

      {/* Mobile: Bottom-Tab-Bar */}
      <div className="md:hidden">
        <div className="mb-1 text-[0.65rem] uppercase tracking-widest font-semibold text-brand-night-navy/50 truncate">
          {clubName}
        </div>
        <BottomTabBar
          contextLabel="Verein"
          items={TABS.map(({ label, href, emoji }) => ({
            label,
            emoji,
            href: `${base}${href}`
          }))}
        />
      </div>
    </>
  );
}
