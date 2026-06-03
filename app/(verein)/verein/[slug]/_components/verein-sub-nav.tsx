"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  HandCoins,
  Handshake,
  FileText,
  Goal,
  ChartColumnIncreasing,
  Gem,
  Settings,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomTabBar } from "@/components/shared/bottom-tab-bar";

type Tab = { label: string; href: string; icon: LucideIcon };

// Mobile-Primärset (5 Bottom-Tabs) — Club-Admin denkt in Mannschaften, Geld, Pacts.
const PRIMARY_TABS: readonly Tab[] = [
  { label: "Übersicht", href: "", icon: LayoutDashboard },
  { label: "Mannschaften", href: "/mannschaften", icon: Users },
  { label: "Sponsoren", href: "/sponsoren", icon: HandCoins },
  { label: "Pacts", href: "/pledges", icon: Handshake },
  { label: "Abrechnungen", href: "/abrechnungen", icon: FileText }
] as const;

// Sekundär → Zahnrad-Sheet (Desktop: hinten im Tab-Streifen).
const OVERFLOW_TABS: readonly Tab[] = [
  { label: "Ereignisse", href: "/ereignisse", icon: Goal },
  { label: "Charges", href: "/charges", icon: ChartColumnIncreasing },
  { label: "Abo", href: "/abo", icon: Gem },
  { label: "Einstellungen", href: "/einstellungen", icon: Settings }
] as const;

const ALL_TABS: readonly Tab[] = [...PRIMARY_TABS, ...OVERFLOW_TABS];

export function VereinSubNav({ slug }: { slug: string; clubName: string }) {
  const pathname = usePathname() ?? "";
  const base = `/verein/${slug}`;

  const matches = (href: string) => {
    const full = `${base}${href}`;
    if (href === "") return pathname === base;
    return pathname === full || pathname.startsWith(full + "/");
  };
  const activeTab = ALL_TABS.reduce<Tab | null>((best, t) => {
    if (!matches(t.href)) return best;
    if (!best || t.href.length > best.href.length) return t;
    return best;
  }, null);

  return (
    <>
      {/* Desktop: horizontale Tab-Leiste (alle Tabs) */}
      <nav className="hidden md:flex gap-1 rounded-2xl border border-brand-neutral/30 bg-brand-off-white p-1.5 overflow-x-auto">
        {ALL_TABS.map(({ label, href }) => {
          const fullHref = `${base}${href}`;
          const isActive = activeTab?.href === href;
          return (
            <Link
              key={href}
              href={fullHref}
              className={cn(
                "shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition-all whitespace-nowrap",
                isActive
                  ? "bg-white text-brand-night-navy shadow-ios-card ring-1 ring-brand-neutral/20"
                  : "text-brand-night-navy/60 hover:text-brand-night-navy hover:bg-white/70"
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile: nur Bottom-Tab-Bar. Verwaltung/Konto liegen im Zahnrad auf der
          Übersicht — nicht auf jedem Screen. */}
      <div className="md:hidden">
        <BottomTabBar
          contextLabel="Verein"
          items={PRIMARY_TABS.map(({ label, href, icon }) => ({
            label,
            icon,
            href: `${base}${href}`
          }))}
        />
      </div>
    </>
  );
}
