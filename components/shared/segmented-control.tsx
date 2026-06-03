"use client";

import { cn } from "@/lib/utils";

interface SegmentedControlOption {
  value: string;
  label: string;
}

interface SegmentedControlProps {
  options: SegmentedControlOption[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  size?: "sm" | "md";
  ariaLabel?: string;
}

/**
 * iOS-Segmented-Control (controlled). Vollbreite Pillen-Leiste; das aktive
 * Segment liegt als weiße Pille mit dezentem Schatten über dem Hintergrund.
 */
export function SegmentedControl({
  options,
  value,
  onValueChange,
  className,
  size = "md",
  ariaLabel
}: SegmentedControlProps) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex w-full rounded-full bg-ios-fill-tertiary p-1",
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-full font-semibold transition-colors",
              size === "md"
                ? "px-3 py-1.5 text-sm"
                : "px-2.5 py-1 text-[13px]",
              active
                ? "bg-white text-brand-night-navy shadow-ios-card"
                : "text-brand-night-navy/55 hover:text-brand-night-navy"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
