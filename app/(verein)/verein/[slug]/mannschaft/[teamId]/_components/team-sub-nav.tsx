"use client";

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
import type { EffectivePlan } from "@/lib/db/queries/user-identities";

/**
 * Team-Scope Sub-Navigation für Mannschafts-Admins (basic/pro Plan).
 *
 * Spiegelt das Layout der `VereinSubNav`, aber:
 *  - Base-URL: `/verein/<slug>/mannschaft/<teamId>`
 *  - Tabs: Team-zentrisch (Übersicht, Pacts, Spiele, Finanzen, Abo, Einstellungen)
 *  - Header zeigt Team-Name (nicht Club-Name) → klare "Du bist hier auf
 *    Mannschafts-Ebene"-Botschaft
 *
 * Naming-Entscheidung (2026-05-25): "Pacts" für Pledges, "Spiele" für Matches,
 * "Finanzen" für die Geld-Übersicht. "Events" bleibt internal für die einzelnen
 * Spielereignisse (Tor, Karte, Auswechslung).
 *
 * Plan-aware Tab-Filter (2026-05-25): Auf einer Vereinslizenz (`verein`) leben
 * Abo + Einstellungen auf Club-Ebene und werden vom VereinSubNav bereitgestellt;
 * im Team-Menü würden sie nur doppelt erscheinen. Bei `basic` / `pro` ist die
 * Mannschaft der Abrechnungs- und Einstellungs-Anker → Tabs bleiben sichtbar.
 */

export type TeamSubNavTab = {
  label: string;
  href: string;
  icon: LucideIcon;
};

// Reihenfolge ist bewusst: die ersten 4 sind das Mobile-Primärset
// (BottomTabBar zeigt slice(0,4) + "Mehr" bei >5 Items). Der Rest landet
// im "Mehr"-Sheet. Desktop zeigt alle horizontal in dieser Reihenfolge.
const ALL_TABS: readonly TeamSubNavTab[] = [
  { label: "Übersicht", href: "", icon: LayoutDashboard },
  { label: "Pacts", href: "/pacts", icon: Handshake },
  { label: "Spiele", href: "/spiele", icon: Goal },
  { label: "Profil", href: "/profil", icon: UserRound },
  { label: "Sponsoren", href: "/sponsoren", icon: Heart },
  { label: "Finanzen", href: "/finanzen", icon: Wallet },
  { label: "Abo", href: "/abo", icon: Gem },
  { label: "Einstellungen", href: "/einstellungen", icon: Settings }
] as const;

/**
 * Liefert die im Team-SubNav sichtbaren Tabs für den gegebenen Effective-Plan.
 *
 * - `verein` → entfernt `Abo` und `Einstellungen` (Club-Ebene-Tabs)
 * - `basic` / `pro` / `null` → volles Tab-Set (Mannschaft ist der Anker)
 *
 * Wird exportiert, damit die Filter-Semantik isoliert testbar ist.
 */
export function getTeamSubNavTabs(
  effectivePlan: EffectivePlan | null
): TeamSubNavTab[] {
  if (effectivePlan === "verein") {
    return ALL_TABS.filter(
      (t) => t.href !== "/abo" && t.href !== "/einstellungen"
    );
  }
  return [...ALL_TABS];
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
  clubName,
  effectivePlan
}: Props) {
  const pathname = usePathname();
  const base = `/verein/${slug}/mannschaft/${teamId}`;

  const tabs = getTeamSubNavTabs(effectivePlan);

  const activeTab = tabs.find(({ href }) => {
    const fullHref = `${base}${href}`;
    if (href === "") return pathname === base;
    return pathname === fullHref || pathname.startsWith(fullHref + "/");
  });

  return (
    <>
      {/* Desktop: horizontal tabs */}
      <nav className="hidden md:flex gap-1 rounded-2xl border border-brand-neutral/30 bg-brand-off-white p-1.5 overflow-x-auto">
        {tabs.map(({ label, href }) => {
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
          {teamName} · {clubName}
        </div>
        <BottomTabBar
          contextLabel="Mannschaft"
          items={tabs.map(({ label, href, icon }) => ({
            label,
            icon,
            href: `${base}${href}`
          }))}
        />
      </div>
    </>
  );
}
