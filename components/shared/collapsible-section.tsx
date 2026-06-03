"use client";

import { useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  /** Optionaler dezenter Untertitel unter dem Titel. */
  subtitle?: string;
  /** z.B. ein "0/4 erledigt"-Badge, rechts neben dem Chevron. */
  right?: React.ReactNode;
  /** Start-Zustand (default true). */
  defaultOpen?: boolean;
  /** Wenn gesetzt: Auf/Zu-Zustand in localStorage persistieren. */
  storageKey?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * iOS-Card-Disclosure (Accordion-Sektion). Sanfte Höhen-Animation via
 * grid-rows-Trick (0fr → 1fr) ohne JS-Messung. Optional persistiert der
 * Auf/Zu-Zustand in localStorage.
 */
export function CollapsibleSection({
  title,
  subtitle,
  right,
  defaultOpen = true,
  storageKey,
  children,
  className
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const contentId = useId();

  // Persistierten Zustand erst nach dem Mount lesen, um Hydration-Mismatch
  // zu vermeiden (Server kennt localStorage nicht).
  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored !== null) setOpen(stored === "1");
    } catch {
      // localStorage nicht verfügbar (z.B. Private Mode) → Default behalten.
    }
  }, [storageKey]);

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (storageKey) {
        try {
          window.localStorage.setItem(storageKey, next ? "1" : "0");
        } catch {
          // Schreiben fehlgeschlagen → ignorieren.
        }
      }
      return next;
    });
  };

  return (
    <div
      className={cn(
        "rounded-2xl bg-white shadow-ios-card",
        className
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-brand-night-navy">
            {title}
          </span>
          {subtitle ? (
            <span className="mt-0.5 block truncate text-[13px] text-brand-night-navy/55">
              {subtitle}
            </span>
          ) : null}
        </span>
        {right ? <span className="shrink-0">{right}</span> : null}
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-brand-night-navy/40 transition-transform duration-300 ease-out",
            open && "rotate-180"
          )}
          aria-hidden
        />
      </button>

      <div
        id={contentId}
        role="region"
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
