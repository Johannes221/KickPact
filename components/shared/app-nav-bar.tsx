"use client";

import Link from "next/link";
import { ChevronLeft, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Native iOS-Navigation-Bar (Mobile-only, `md:hidden`). Ersetzt im
 * authentifizierten App-Bereich den globalen Marketing-Logo-Header.
 *
 * Aufbau wie eine UIKit-Navigation-Bar: links optional ein Back-Chevron,
 * mittig/links der Screen-Titel (+ optionaler dezenter Subtitle), rechts EINE
 * Action — i.d.R. das Zahnrad, das das `SettingsSheet` öffnet.
 *
 * Bewusst statische (nicht kollabierende) Höhe in v1: full-bleed, fixed,
 * frosted, safe-area-aware. Der große, vollständig umbrechende Seitentitel
 * lebt im Content über `PageHeader` — die Bar trägt nur den kurzen Sektions-
 * Titel (kein Truncation-Problem, da Tab-Namen kurz sind).
 */
export interface AppNavBarProps {
  /** Kurzer Sektions-Titel (z.B. "Übersicht", "Spiele"). */
  title: string;
  /** Optionaler dezenter Subtitle (z.B. Datum auf Detail-Screens). Wird in der
   *  Bar einzeilig gekürzt — lange Namen gehören in den `PageHeader` im Content. */
  subtitle?: string;
  /** Wenn gesetzt: Back-Chevron links, der hierhin navigiert. */
  backHref?: string;
  /** Öffnet das Zahnrad-/Einstellungs-Sheet. */
  onSettings?: () => void;
  /** Zeigt einen roten Punkt auf dem Zahnrad (offene Hinweise). */
  settingsBadge?: boolean;
  className?: string;
}

export function AppNavBar({
  title,
  subtitle,
  backHref,
  onSettings,
  settingsBadge = false,
  className
}: AppNavBarProps) {
  return (
    <>
      <header
        className={cn(
          "md:hidden fixed inset-x-0 top-0 z-40 border-b border-brand-neutral/30 bg-white/85 backdrop-blur-xl pt-[env(safe-area-inset-top)]",
          className
        )}
      >
        <div className="flex min-h-[56px] items-center gap-2 px-4 py-2">
          {backHref ? (
            <Link
              href={backHref}
              aria-label="Zurück"
              className="-ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-brand-night-navy transition-colors active:bg-brand-off-white"
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={2.2} aria-hidden />
            </Link>
          ) : null}

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[22px] font-bold leading-tight text-brand-night-navy">
              {title}
            </h1>
            {subtitle ? (
              <p className="truncate text-[13px] font-medium text-brand-night-navy/55">
                {subtitle}
              </p>
            ) : null}
          </div>

          {onSettings ? (
            <button
              type="button"
              onClick={onSettings}
              aria-label="Menü & Einstellungen"
              className="relative -mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-brand-night-navy transition-colors active:bg-brand-off-white"
            >
              <Settings2 className="h-[1.4rem] w-[1.4rem]" strokeWidth={2} aria-hidden />
              {settingsBadge ? (
                <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-brand-alert-red ring-2 ring-white" />
              ) : null}
            </button>
          ) : null}
        </div>
      </header>
    </>
  );
}

/**
 * Spacer passend zur fixen `AppNavBar`-Höhe. Wird EINMAL pro Scroll-Container
 * vom Layout ganz oben gerendert (nicht von der Bar selbst), damit bei
 * verschachtelten Sub-Navs nur ein Spacer existiert und die fixe Bar nichts
 * überlappt. Mobile-only.
 */
export function AppNavBarSpacer() {
  return (
    <div aria-hidden className="md:hidden h-[calc(56px+env(safe-area-inset-top))]" />
  );
}
