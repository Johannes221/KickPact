"use client";

import { useState } from "react";
import { Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SettingsSheet,
  type SettingsNavItem,
  type SettingsIconKey
} from "@/components/shared/settings-sheet";

/**
 * Zahnrad-Button (Instagram-artig) — lebt NUR im Profil-/Konto-Bereich, nicht
 * auf jedem Screen. Öffnet das SettingsSheet (Verwaltung + Konto + Rechtliches).
 */
export function SettingsButton({
  contextLabel,
  overflowItems,
  activeHref,
  className
}: {
  contextLabel: string;
  overflowItems: SettingsNavItem[];
  activeHref?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Menü & Einstellungen"
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full border border-brand-neutral/40 bg-white text-brand-night-navy shadow-sm transition-colors active:bg-brand-off-white",
          className
        )}
      >
        <Settings2 className="h-5 w-5" strokeWidth={2} aria-hidden />
      </button>
      <SettingsSheet
        open={open}
        onOpenChange={setOpen}
        contextLabel={contextLabel}
        overflowItems={overflowItems}
        activeHref={activeHref}
      />
    </>
  );
}

export type { SettingsNavItem, SettingsIconKey };
