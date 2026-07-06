"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  Compass,
  Target,
  Users,
  User,
  TrendingUp,
  ChartColumnIncreasing,
  FileText,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomTabBar } from "@/components/shared/bottom-tab-bar";
import { AppNavBar } from "@/components/shared/app-nav-bar";
import type { SettingsNavItem } from "@/components/shared/settings-sheet";

type Tab = { label: string; href: string; icon: LucideIcon };

// Mobile-Primärset (5 Bottom-Tabs). Benachrichtigungen liegen jetzt in der
// Glocke oben links → statt „Inbox" ein „Mannschaften"-Tab (Übersicht aller
// gesponserten Teams).
const PRIMARY_TABS: readonly Tab[] = [
  { label: "Übersicht", href: "/sponsor", icon: House },
  { label: "Entdecken", href: "/sponsor/discover", icon: Compass },
  { label: "Pacts", href: "/sponsor/pledge", icon: Target },
  { label: "Teams", href: "/sponsor/mannschaften", icon: Users },
  { label: "Profil", href: "/sponsor/profil", icon: User }
] as const;

// Sekundär → Zahnrad-Sheet.
const OVERFLOW_TABS: readonly Tab[] = [
  { label: "Bilanz", href: "/sponsor/bilanz", icon: TrendingUp },
  { label: "Beiträge", href: "/sponsor/charges", icon: ChartColumnIncreasing },
  { label: "Übersichten", href: "/sponsor/rechnungen", icon: FileText }
] as const;

const ALL_TABS: readonly Tab[] = [...PRIMARY_TABS, ...OVERFLOW_TABS];

// Verwaltungs-Links fürs Zahnrad-Sheet (= Overflow, mit serialisierbaren
// Icon-Keys). Single source of truth — die Profil-Seite reicht das nicht mehr
// separat durch.
const SETTINGS_ITEMS: SettingsNavItem[] = [
  { label: "Bilanz", href: "/sponsor/bilanz", icon: "trending" },
  { label: "Beiträge", href: "/sponsor/charges", icon: "chart" },
  { label: "Übersichten", href: "/sponsor/rechnungen", icon: "file" }
];

export function SponsorSubNav({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname() ?? "";

  const matches = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
  const activeTab = ALL_TABS.reduce<Tab | null>((best, t) => {
    if (!matches(t.href)) return best;
    if (!best || t.href.length > best.href.length) return t;
    return best;
  }, null);

  // Detail-Route = tiefer als der aktive Tab (z.B. /sponsor/pledge/<id>).
  // Dann: Back-Chevron + Vorgänger-Name statt Sektions-Titel.
  const isDetail =
    !!activeTab &&
    pathname !== activeTab.href &&
    pathname.startsWith(activeTab.href + "/");

  return (
    <>
      {/* Mobile: fixe iOS-NavBar (Titel/Back + Zahnrad). */}
      <AppNavBar
        brand
        title={isDetail ? undefined : activeTab?.label ?? "Sponsor"}
        backHref={isDetail ? activeTab?.href : undefined}
        backLabel={isDetail ? activeTab?.label : undefined}
        settings={{
          contextLabel: "Sponsor",
          overflowItems: SETTINGS_ITEMS,
          activeHref: pathname
        }}
      />

      {/* Desktop: horizontaler Tab-Streifen (alle Tabs) */}
      <nav className="hidden md:flex gap-0.5 overflow-x-auto rounded-xl bg-brand-night-navy/5 p-1 no-scrollbar">
        {ALL_TABS.map(({ label, href }) => {
          const isActive = activeTab?.href === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors whitespace-nowrap",
                isActive
                  ? "bg-white text-brand-night-navy shadow-ios-card"
                  : "text-brand-night-navy/50 hover:text-brand-night-navy hover:bg-white/60"
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Mobile: nur Bottom-Tab-Bar. Verwaltung/Konto liegen im Profil-Tab. */}
      <div className="md:hidden">
        <BottomTabBar
          contextLabel="Sponsor"
          items={PRIMARY_TABS.map(({ label, href, icon }) => ({
            label,
            icon,
            href
          }))}
        />
      </div>
    </>
  );
}
