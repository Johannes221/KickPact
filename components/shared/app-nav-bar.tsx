"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SettingsSheet,
  type SettingsNavItem
} from "@/components/shared/settings-sheet";
import { NotificationsBell } from "@/components/shared/notifications-bell";

/**
 * Native iOS-Navigation-Bar (Mobile-only, `md:hidden`). Fixed, frosted,
 * safe-area-aware. Trägt im authentifizierten App-Bereich den Sektions-Titel,
 * links optional einen Back-Chevron (Tint-Farbe + Name des vorherigen Screens,
 * Aufgabe 3) und rechts EINE persistente Aktion — i.d.R. das Zahnrad, das das
 * `SettingsSheet` öffnet (Ecke nie leer, Aufgabe 2).
 *
 * Large-Title-Kollaps (Aufgabe 2): Der große Seitentitel lebt im Content
 * (`PageHeader`). Der Inline-Titel in der Bar ist am Scroll-Anfang ausgeblendet
 * und faded erst ein, sobald der große Titel unter die Bar gescrollt ist — wie
 * eine UIKit-NavigationBar mit `.large`-Display-Mode.
 */
export interface AppNavBarProps {
  /** Kurzer Sektions-Titel (z.B. "Übersicht", "Spiele"). Leer auf Detail-Screens. */
  title?: string;
  /** Optionaler dezenter Subtitle (einzeilig gekürzt). */
  subtitle?: string;
  /** Wenn gesetzt: Back-Chevron links, der hierhin navigiert. */
  backHref?: string;
  /** Name des vorherigen Screens neben dem Chevron (z.B. "Spiele"). */
  backLabel?: string;
  /** Self-contained Zahnrad + SettingsSheet als rechte Aktion. */
  settings?: {
    contextLabel: string;
    overflowItems: SettingsNavItem[];
    activeHref?: string;
    /** Roter Punkt auf dem Zahnrad (offene Hinweise). */
    badge?: boolean;
  };
  /** Eigene rechte Aktion (überschreibt `settings`, selten gebraucht). */
  right?: React.ReactNode;
  /** Inline-Titel sofort zeigen statt erst beim Scrollen (z.B. Detail-Screens
   *  ohne großen Body-Titel). */
  alwaysShowTitle?: boolean;
  /**
   * Root-/Dashboard-Screen-Modus: zeigt links die Benachrichtigungs-Glocke
   * (mit Badge) und mittig die KickPact-Wortmarke statt des Inline-Titels.
   * Greift nur, wenn KEIN `backHref` gesetzt ist (Detail-Screens behalten
   * Back + Titel).
   */
  brand?: boolean;
  className?: string;
}

export function AppNavBar({
  title,
  subtitle,
  backHref,
  backLabel,
  settings,
  right,
  alwaysShowTitle = false,
  brand = false,
  className
}: AppNavBarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Large-Title-Kollaps: Inline-Titel erst zeigen, wenn der große Body-Titel
  // weggescrollt ist. Schwelle bewusst klein (36px) — der PageHeader sitzt
  // direkt unter der Bar.
  useEffect(() => {
    if (alwaysShowTitle) return;
    const onScroll = () => setCollapsed(window.scrollY > 36);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [alwaysShowTitle]);

  const titleVisible = alwaysShowTitle || collapsed;
  // Root-/Dashboard-Screen: Glocke links + Wortmarke mittig (nur ohne Back).
  const brandCentered = brand && !backHref;

  return (
    <header
      className={cn(
        "md:hidden fixed inset-x-0 top-0 z-40 border-b border-brand-neutral/30 bg-white/85 backdrop-blur-xl pt-[env(safe-area-inset-top)]",
        className
      )}
    >
      <div className="relative flex min-h-[56px] items-center gap-1.5 px-2 py-2">
        {/* Links: Back (Detail) ODER Glocke (Root-/Dashboard-Screen). */}
        <div className="flex min-w-0 flex-1 items-center">
          {backHref ? (
            <Link
              href={backHref}
              aria-label={backLabel ? `Zurück zu ${backLabel}` : "Zurück"}
              className="-ml-1 flex shrink-0 items-center gap-0.5 rounded-full py-1 pl-1 pr-2 text-accent transition-opacity active:opacity-60"
            >
              <ChevronLeft className="h-7 w-7" strokeWidth={2.2} aria-hidden />
              {backLabel ? (
                <span className="max-w-[40vw] truncate text-ios-body leading-none">
                  {backLabel}
                </span>
              ) : null}
            </Link>
          ) : brand ? (
            <NotificationsBell />
          ) : null}

          {/* Inline-Titel nur, wenn die Wortmarke NICHT mittig steht. */}
          {!brandCentered && title ? (
            <div
              className={cn(
                "min-w-0 px-1 transition-all duration-200",
                titleVisible
                  ? "translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-0.5 opacity-0"
              )}
            >
              <h1 className="truncate text-ios-headline leading-tight text-ios-label">
                {title}
              </h1>
              {subtitle ? (
                <p className="truncate text-ios-caption font-medium text-ios-label-secondary">
                  {subtitle}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Mitte (absolut zentriert): KickPact-Wortmarke auf Root-Screens. */}
        {brandCentered ? (
          <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Image
              src="/brand/wordmark.png"
              alt="KICKPACT"
              width={1145}
              height={216}
              priority
              className="h-[18px] w-auto"
            />
          </span>
        ) : null}

        {/* Rechts: persistente Aktion — Zahnrad (Default) oder Custom. */}
        {right ? (
          <div className="shrink-0">{right}</div>
        ) : settings ? (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Menü & Einstellungen"
            className="relative -mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-accent transition-colors active:bg-brand-off-white"
          >
            <Settings2 className="h-[1.4rem] w-[1.4rem]" strokeWidth={2} aria-hidden />
            {settings.badge ? (
              <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-brand-alert-red ring-2 ring-white" />
            ) : null}
          </button>
        ) : null}
      </div>

      {settings ? (
        <SettingsSheet
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          contextLabel={settings.contextLabel}
          overflowItems={settings.overflowItems}
          activeHref={settings.activeHref}
        />
      ) : null}
    </header>
  );
}

/**
 * Spacer passend zur fixen `AppNavBar`-Höhe. Wird EINMAL pro Scroll-Container
 * ganz oben gerendert, damit die fixe Bar nichts überlappt. Mobile-only.
 */
export function AppNavBarSpacer() {
  return (
    <div aria-hidden className="md:hidden h-[calc(56px+env(safe-area-inset-top))]" />
  );
}
