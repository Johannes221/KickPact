"use client";

/**
 * Range-Selector für die Sponsor-Bilanz-Page. Setzt `?range=this-month|...`
 * oder `?range=custom&from=YYYY-MM-DD&to=YYYY-MM-DD` in der URL — die
 * Server-Component liest das aus `searchParams` und reagiert.
 *
 * UX:
 *   - Pill-Buttons für die 4 Presets
 *   - "Eigener Zeitraum" → zwei `<input type="date">` werden eingeblendet
 */

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const PRESETS = [
  { value: "this-month", label: "Dieser Monat" },
  { value: "this-year", label: "Dieses Jahr" },
  { value: "this-season", label: "Diese Saison" },
  { value: "all-time", label: "Gesamt" }
] as const;

export type RangePreset = (typeof PRESETS)[number]["value"];

export function BilanzRangeSelector({
  current,
  from,
  to
}: {
  current: RangePreset | "custom";
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setRange(range: RangePreset | "custom") {
    const next = new URLSearchParams(searchParams.toString());
    next.set("range", range);
    if (range !== "custom") {
      next.delete("from");
      next.delete("to");
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  function setDate(key: "from" | "to", value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("range", "custom");
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setRange(p.value)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
              current === p.value
                ? "bg-brand-night-navy text-white"
                : "bg-brand-night-navy/5 text-brand-night-navy/70 hover:bg-brand-night-navy/10"
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setRange("custom")}
          className={cn(
            "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
            current === "custom"
              ? "bg-brand-night-navy text-white"
              : "bg-brand-night-navy/5 text-brand-night-navy/70 hover:bg-brand-night-navy/10"
          )}
        >
          Eigener Zeitraum
        </button>
      </div>

      {current === "custom" && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-brand-night-navy/60">
            Von
            <input
              type="date"
              defaultValue={from ?? ""}
              onChange={(e) => setDate("from", e.target.value)}
              className="h-9 rounded-md border border-brand-neutral bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-neutral"
            />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-brand-night-navy/60">
            Bis
            <input
              type="date"
              defaultValue={to ?? ""}
              onChange={(e) => setDate("to", e.target.value)}
              className="h-9 rounded-md border border-brand-neutral bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-neutral"
            />
          </label>
        </div>
      )}
    </div>
  );
}
