"use client";

import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";

interface FilterSheetProps {
  children: React.ReactNode; // die Filter-Controls (z.B. SegmentedControls)
  activeCount?: number; // Anzahl aktiver Filter → Badge auf dem Trigger
  title?: string; // Sheet-Titel, default "Filter"
  onReset?: () => void; // wenn gesetzt: "Zurücksetzen"-Button im Sheet-Footer
  triggerLabel?: string; // default "Filter"
  triggerClassName?: string;
}

/**
 * Kompakte Filter-Pille, die ein Bottom-Sheet mit den übergebenen Filter-Controls
 * öffnet (native-iOS-Gefühl). Der Trigger zeigt optional einen Akzent-Badge mit der
 * Anzahl aktiver Filter. Im Sheet-Footer schließt "Fertig" das Sheet; "Zurücksetzen"
 * (falls `onReset` gesetzt) ruft den Reset-Callback, ohne zwingend zu schließen.
 */
export function FilterSheet({
  children,
  activeCount = 0,
  title = "Filter",
  onReset,
  triggerLabel = "Filter",
  triggerClassName
}: FilterSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-2 rounded-full bg-white shadow-ios-card px-3.5 py-2 text-sm font-semibold text-brand-night-navy",
            triggerClassName
          )}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          {triggerLabel}
          {activeCount > 0 ? (
            <span className="ml-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white">
              {activeCount}
            </span>
          ) : null}
        </button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl border-brand-neutral/30 bg-white pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader>
          <SheetTitle className="text-left text-lg font-bold">
            {title}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-5">{children}</div>

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full rounded-xl bg-accent py-2.5 font-semibold text-white"
          >
            Fertig
          </button>
          {onReset ? (
            <button
              type="button"
              onClick={onReset}
              className="w-full py-1.5 text-sm font-semibold text-brand-night-navy/60"
            >
              Zurücksetzen
            </button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

interface ActiveFilterChipsProps {
  chips: FilterChip[];
  className?: string;
}

/**
 * Horizontale, umbrechende Reihe entfernbarer Filter-Pillen. Rendert `null`,
 * wenn keine Chips aktiv sind.
 */
export function ActiveFilterChips({
  chips,
  className
}: ActiveFilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full bg-brand-off-white px-3 py-1 text-[13px] font-medium text-brand-night-navy"
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`${chip.label} entfernen`}
            className="grid place-items-center"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      ))}
    </div>
  );
}
