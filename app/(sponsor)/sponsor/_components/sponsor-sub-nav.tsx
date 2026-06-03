"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  Compass,
  Target,
  Inbox,
  User,
  TrendingUp,
  ChartColumnIncreasing,
  FileText,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomTabBar } from "@/components/shared/bottom-tab-bar";

type Tab = { label: string; href: string; icon: LucideIcon };

// Mobile-Primärset (5 Bottom-Tabs). Inbox vorne wegen Pending-Badge.
const PRIMARY_TABS: readonly Tab[] = [
  { label: "Übersicht", href: "/sponsor", icon: House },
  { label: "Entdecken", href: "/sponsor/discover", icon: Compass },
  { label: "Pacts", href: "/sponsor/pledge", icon: Target },
  { label: "Inbox", href: "/sponsor/inbox", icon: Inbox },
  { label: "Profil", href: "/sponsor/profil", icon: User }
] as const;

// Sekundär → Zahnrad-Sheet.
const OVERFLOW_TABS: readonly Tab[] = [
  { label: "Bilanz", href: "/sponsor/bilanz", icon: TrendingUp },
  { label: "Beiträge", href: "/sponsor/charges", icon: ChartColumnIncreasing },
  { label: "Rechnungen", href: "/sponsor/rechnungen", icon: FileText }
] as const;

const ALL_TABS: readonly Tab[] = [...PRIMARY_TABS, ...OVERFLOW_TABS];

export function SponsorSubNav({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname() ?? "";

  const matches = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");
  const activeTab = ALL_TABS.reduce<Tab | null>((best, t) => {
    if (!matches(t.href)) return best;
    if (!best || t.href.length > best.href.length) return t;
    return best;
  }, null);

  return (
    <>
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
              {href === "/sponsor/inbox" && pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-accent text-white text-[0.6rem] font-bold flex items-center justify-center px-1 leading-none">
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
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
            href,
            badge: href === "/sponsor/inbox" ? pendingCount : undefined
          }))}
        />
      </div>
    </>
  );
}
