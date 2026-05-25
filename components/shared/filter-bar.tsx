"use client";

/**
 * FilterBar — wiederverwendbare URL-State-Filter-Leiste.
 *
 * Pattern:
 *   - Parent Server-Component liest die Filter aus `searchParams` und gibt
 *     sie + die Filter-Definitionen (key, label, type, options) an die
 *     FilterBar. Die FilterBar selbst hält keinen lokalen State — sie
 *     schreibt nur in die URL und der Server-Component-Rerender macht den
 *     Rest.
 *   - Filter-Typen: "text" (Input), "select" (Dropdown), "dateRange"
 *     (zwei Date-Inputs → schreibt `<key>From` und `<key>To`).
 *
 * Aktive Filter werden als Chip-Liste über dem Tabelle gezeigt; Klick auf
 * das ×-Icon entfernt den einzelnen Filter, "Filter löschen" entfernt alle.
 *
 * Page-Reset: jeder Filter-Change setzt `?page` zurück auf den Default
 * (entfernt den Key aus der URL), damit der User nicht auf Seite 5 hängt
 * wenn der gefilterte Result nur 8 Zeilen hat.
 */

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterDefinition =
  | {
      key: string;
      label: string;
      type: "text";
      placeholder?: string;
    }
  | {
      key: string;
      label: string;
      type: "select";
      options: Array<{ value: string; label: string }>;
      /** Optional explicit placeholder for the "Alle"-empty-state. */
      placeholder?: string;
    }
  | {
      key: string;
      label: string;
      type: "dateRange";
      /** writes `${key}From` and `${key}To`. */
    };

export interface FilterBarProps {
  filters: FilterDefinition[];
  /** Optional className for the outer wrapper. */
  className?: string;
  /** Optional render slot on the right (e.g. CsvExportButton). */
  rightSlot?: React.ReactNode;
}

function buildQs(
  current: URLSearchParams,
  patch: Record<string, string | undefined | null>
): string {
  const next = new URLSearchParams(current.toString());
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null || v === "") next.delete(k);
    else next.set(k, v);
  }
  // Filter-Change → Page-Reset.
  next.delete("page");
  return next.toString();
}

function urlKeys(f: FilterDefinition): string[] {
  if (f.type === "dateRange") return [`${f.key}From`, `${f.key}To`];
  return [f.key];
}

export function FilterBar({ filters, className, rightSlot }: FilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const navigate = React.useCallback(
    (patch: Record<string, string | undefined | null>) => {
      const qs = buildQs(searchParams, patch);
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [router, pathname, searchParams]
  );

  function readVal(key: string): string {
    return searchParams.get(key) ?? "";
  }

  function clearAll() {
    const patch: Record<string, undefined> = {};
    for (const f of filters) for (const k of urlKeys(f)) patch[k] = undefined;
    navigate(patch);
  }

  // ─── Aktive Filter für die Chip-Reihe sammeln ───
  const activeChips: Array<{ urlKey: string; label: string; valueLabel: string }> = [];
  for (const f of filters) {
    if (f.type === "dateRange") {
      const from = readVal(`${f.key}From`);
      const to = readVal(`${f.key}To`);
      if (from || to) {
        const valueLabel = `${from || "…"} – ${to || "…"}`;
        activeChips.push({
          urlKey: `__range:${f.key}`,
          label: f.label,
          valueLabel
        });
      }
    } else {
      const v = readVal(f.key);
      if (!v) continue;
      if (f.type === "select") {
        const opt = f.options.find((o) => o.value === v);
        activeChips.push({
          urlKey: f.key,
          label: f.label,
          valueLabel: opt?.label ?? v
        });
      } else {
        activeChips.push({ urlKey: f.key, label: f.label, valueLabel: v });
      }
    }
  }

  function removeChip(urlKey: string) {
    if (urlKey.startsWith("__range:")) {
      const k = urlKey.slice("__range:".length);
      navigate({ [`${k}From`]: undefined, [`${k}To`]: undefined });
    } else {
      navigate({ [urlKey]: undefined });
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between">
        <div className="flex flex-wrap items-end gap-2 md:gap-3">
          {filters.map((f) => (
            <FilterControl
              key={f.key}
              def={f}
              readVal={readVal}
              navigate={navigate}
            />
          ))}
        </div>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeChips.map((c) => (
            <button
              key={c.urlKey}
              type="button"
              onClick={() => removeChip(c.urlKey)}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent-dark hover:bg-accent/15 transition-colors"
            >
              <span className="text-brand-night-navy/60">{c.label}:</span>
              <span className="truncate max-w-[18ch]">{c.valueLabel}</span>
              <X className="h-3 w-3" />
            </button>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-brand-night-navy/60 underline-offset-2 hover:underline"
          >
            Filter löschen
          </button>
        </div>
      )}
    </div>
  );
}

function FilterControl({
  def,
  readVal,
  navigate
}: {
  def: FilterDefinition;
  readVal: (key: string) => string;
  navigate: (patch: Record<string, string | undefined | null>) => void;
}) {
  if (def.type === "text") {
    return (
      <label className="flex flex-col gap-1 min-w-[10rem]">
        <span className="text-[0.65rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
          {def.label}
        </span>
        <input
          type="text"
          defaultValue={readVal(def.key)}
          placeholder={def.placeholder}
          onBlur={(e) => navigate({ [def.key]: e.target.value || undefined })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              navigate({ [def.key]: (e.target as HTMLInputElement).value || undefined });
            }
          }}
          className="h-9 rounded-md border border-brand-neutral bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-neutral"
        />
      </label>
    );
  }

  if (def.type === "select") {
    return (
      <label className="flex flex-col gap-1 min-w-[10rem]">
        <span className="text-[0.65rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
          {def.label}
        </span>
        <select
          value={readVal(def.key)}
          onChange={(e) => navigate({ [def.key]: e.target.value || undefined })}
          className="h-9 rounded-md border border-brand-neutral bg-white px-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-neutral"
        >
          <option value="">{def.placeholder ?? "Alle"}</option>
          {def.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  // dateRange
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.65rem] uppercase tracking-widest font-semibold text-brand-night-navy/50">
        {def.label}
      </span>
      <div className="flex items-center gap-1.5">
        <input
          type="date"
          defaultValue={readVal(`${def.key}From`)}
          onChange={(e) =>
            navigate({ [`${def.key}From`]: e.target.value || undefined })
          }
          className="h-9 rounded-md border border-brand-neutral bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-neutral"
          aria-label={`${def.label} von`}
        />
        <span className="text-xs text-brand-night-navy/40">–</span>
        <input
          type="date"
          defaultValue={readVal(`${def.key}To`)}
          onChange={(e) =>
            navigate({ [`${def.key}To`]: e.target.value || undefined })
          }
          className="h-9 rounded-md border border-brand-neutral bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-neutral"
          aria-label={`${def.label} bis`}
        />
      </div>
    </div>
  );
}
