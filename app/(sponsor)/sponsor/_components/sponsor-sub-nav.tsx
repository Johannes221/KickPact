"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BottomTabBar } from "@/components/shared/bottom-tab-bar";

const TABS = [
  { label: "Übersicht", href: "/sponsor", emoji: "🏠" },
  { label: "Bilanz", href: "/sponsor/bilanz", emoji: "📈" },
  { label: "Charges", href: "/sponsor/charges", emoji: "📊" },
  { label: "Wetten", href: "/sponsor/pledge", emoji: "🎯" },
  { label: "Inbox", href: "/sponsor/inbox", emoji: "📥" },
  { label: "Rechnungen", href: "/sponsor/rechnungen", emoji: "📄" },
  { label: "Discover", href: "/sponsor/discover", emoji: "🔍" },
  { label: "Profil", href: "/sponsor/profil", emoji: "👤" }
];

// Mobile-Reihenfolge: die 4 wichtigsten zuerst (werden zu Bottom-Tabs),
// Rest landet hinter "Mehr". Inbox vorne, damit das Pending-Badge sichtbar ist.
const MOBILE_ORDER = [
  "/sponsor",
  "/sponsor/pledge",
  "/sponsor/inbox",
  "/sponsor/rechnungen",
  "/sponsor/bilanz",
  "/sponsor/charges",
  "/sponsor/discover",
  "/sponsor/profil"
];

export function SponsorSubNav({ pendingCount }: { pendingCount: number }) {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop: horizontaler Tab-Streifen */}
      <nav className="hidden md:flex gap-0.5 overflow-x-auto rounded-xl bg-brand-night-navy/5 p-1 no-scrollbar">
        {TABS.map(({ label, href }) => {
          const isActive = href === "/sponsor"
            ? pathname === "/sponsor" || pathname === "/sponsor/"
            : pathname === href || pathname.startsWith(href + "/");

          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors whitespace-nowrap",
                isActive
                  ? "bg-white text-brand-night-navy shadow-sm"
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

      {/* Mobile: Bottom-Tab-Bar */}
      <BottomTabBar
        contextLabel="Sponsor"
        items={MOBILE_ORDER.map((href) => {
          const tab = TABS.find((t) => t.href === href)!;
          return {
            label: tab.label,
            emoji: tab.emoji,
            href: tab.href,
            badge: tab.href === "/sponsor/inbox" ? pendingCount : undefined
          };
        })}
      />
    </>
  );
}
