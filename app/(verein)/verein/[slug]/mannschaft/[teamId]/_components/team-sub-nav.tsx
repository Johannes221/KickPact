"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Handshake,
  Heart,
  Goal,
  Wallet,
  Gem,
  Settings,
  UserRound,
  type LucideIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BottomTabBar } from "@/components/shared/bottom-tab-bar";
import { AppNavBar } from "@/components/shared/app-nav-bar";
import { SettingsSheet, type SettingsNavItem } from "@/components/shared/settings-sheet";
import type { EffectivePlan } from "@/lib/db/queries/user-identities";

/**
 * Team-Scope-Navigation (native iOS-Shell).
 *
 * Mobile: feste Bottom-Tab-Bar mit GENAU 5 primären Tabs
 * (Übersicht · Spiele · Pacts · Sponsoren · Profil) + oben eine AppNavBar mit
 * Zahnrad, das alles Sekundäre (Finanzen/Abo/Einstellungen) + Konto + Rechtliches
 * im SettingsSheet bündelt. Kein "Mehr"-Tab mehr.
 *
 * Desktop: horizontaler Tab-Streifen mit allen Tabs.
 *
 * Naming (2026-05-25): "Pacts" für Pledges, "Spiele" für Matches.
 * Plan-aware (2026-05-25): Auf Vereinslizenz (`verein`) leben Abo + Einstellungen
 * auf Club-Ebene → hier raus.
 */

export type TeamSubNavTab = {
  label: string;
  href: string;
  icon: LucideIcon;
};

// Mobile-Primärset: diese 5 sind die Bottom-Tabs (vom Nutzer freigegebene IA).
const PRIMARY_TABS: readonly TeamSubNavTab[] = [
  { label: "Übersicht", href: "", icon: LayoutDashboard },
  { label: "Spiele", href: "/spiele", icon: Goal },
  { label: "Pacts", href: "/pacts", icon: Handshake },
  { label: "Sponsoren", href: "/sponsoren", icon: Heart },
  { label: "Profil", href: "/profil", icon: UserRound }
] as const;

// Sekundär: landet im Zahnrad-Sheet (Desktop: hinten im Tab-Streifen).
const OVERFLOW_TABS: readonly TeamSubNavTab[] = [
  { label: "Finanzen", href: "/finanzen", icon: Wallet },
  { label: "Abo", href: "/abo", icon: Gem },
  { label: "Einstellungen", href: "/einstellungen", icon: Settings }
] as const;

/**
 * Sekundäre Tabs für den Effective-Plan: `verein` entfernt Abo + Einstellungen
 * (die leben auf Club-Ebene). Exportiert für isolierte Tests.
 */
export function getTeamOverflowTabs(
  effectivePlan: EffectivePlan | null
): TeamSubNavTab[] {
  if (effectivePlan === "verein") {
    return OVERFLOW_TABS.filter(
      (t) => t.href !== "/abo" && t.href !== "/einstellungen"
    );
  }
  return [...OVERFLOW_TABS];
}

/**
 * Vollständiges, sichtbares Tab-Set (Primär + sichtbares Overflow) in
 * Anzeige-Reihenfolge — für die Desktop-Leiste und Tests.
 */
export function getTeamSubNavTabs(
  effectivePlan: EffectivePlan | null
): TeamSubNavTab[] {
  return [...PRIMARY_TABS, ...getTeamOverflowTabs(effectivePlan)];
}

interface Props {
  slug: string;
  teamId: string;
  teamName: string;
  clubName: string;
  effectivePlan: EffectivePlan | null;
}

export function TeamSubNav({
  slug,
  teamId,
  teamName,
  effectivePlan
}: Props) {
  const pathname = usePathname() ?? "";
  const base = `/verein/${slug}/mannschaft/${teamId}`;
  const [settingsOpen, setSettingsOpen] = useState(false);

  const allTabs = getTeamSubNavTabs(effectivePlan);
  const overflowTabs = getTeamOverflowTabs(effectivePlan);

  // Aktiven Tab über längstes passendes Pfad-Präfix bestimmen.
  const matches = (href: string) => {
    const full = `${base}${href}`;
    if (href === "") return pathname === base;
    return pathname === full || pathname.startsWith(full + "/");
  };
  const activeTab = allTabs.reduce<TeamSubNavTab | null>((best, t) => {
    if (!matches(t.href)) return best;
    if (!best || t.href.length > best.href.length) return t;
    return best;
  }, null);

  const overflowItems: SettingsNavItem[] = overflowTabs.map((t) => ({
    label: t.label,
    href: `${base}${t.href}`,
    icon: t.icon
  }));
  const overflowActive = overflowTabs.some((t) => matches(t.href));

  return (
    <>
      {/* Desktop: horizontale Tab-Leiste (alle Tabs) */}
      <nav className="hidden md:flex gap-1 rounded-2xl border border-brand-neutral/30 bg-brand-off-white p-1.5 overflow-x-auto">
        {allTabs.map(({ label, href }) => {
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

      {/* Mobile: native Nav-Bar (oben) + Bottom-Tab-Bar (unten) + Zahnrad-Sheet */}
      <div className="md:hidden">
        <AppNavBar
          title={activeTab?.label ?? "Übersicht"}
          onSettings={() => setSettingsOpen(true)}
          settingsBadge={overflowActive}
        />
        <BottomTabBar
          contextLabel="Mannschaft"
          items={PRIMARY_TABS.map(({ label, href, icon }) => ({
            label,
            icon,
            href: `${base}${href}`
          }))}
        />
        <SettingsSheet
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          contextLabel={teamName}
          overflowItems={overflowItems}
          activeHref={activeTab ? `${base}${activeTab.href}` : undefined}
        />
      </div>
    </>
  );
}
