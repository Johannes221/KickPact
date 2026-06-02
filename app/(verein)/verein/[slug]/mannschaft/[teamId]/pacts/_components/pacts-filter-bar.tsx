"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SegmentedControl } from "@/components/shared/segmented-control";
import {
  ActiveFilterChips,
  FilterSheet
} from "@/components/shared/filter-sheet";

type FilterStatus = "all" | "active" | "paused" | "ended";
type FilterKind = "all" | "auto" | "manual" | "season";

const DEFAULT_STATUS: FilterStatus = "active";
const DEFAULT_KIND: FilterKind = "all";

const STATUS_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: "active", label: "Aktiv" },
  { value: "paused", label: "Pausiert" },
  { value: "ended", label: "Beendet" },
  { value: "all", label: "Alle" }
];

const KIND_OPTIONS: { value: FilterKind; label: string }[] = [
  { value: "all", label: "Alle" },
  { value: "auto", label: "Auto" },
  { value: "manual", label: "Manuell" },
  { value: "season", label: "Saison" }
];

const STATUS_CHIP_LABEL: Record<FilterStatus, string> = {
  all: "Alle",
  active: "Aktiv",
  paused: "Pausiert",
  ended: "Beendet"
};

const KIND_CHIP_LABEL: Record<FilterKind, string> = {
  all: "Alle",
  auto: "Auto",
  manual: "Manuell",
  season: "Saison"
};

interface PactsFilterBarProps {
  status: FilterStatus;
  kind: FilterKind;
}

/**
 * Mobile-only (md:hidden) Filter-Leiste für die Pacts-Liste. Schreibt den
 * Filter-State exakt wie zuvor in die URL-searchParams (`status`, `kind`) —
 * SegmentedControl/FilterSheet sind client-controlled, deshalb dieser Wrapper.
 */
export function PactsFilterBar({ status, kind }: PactsFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParams = useCallback(
    (next: { status?: FilterStatus; kind?: FilterKind }) => {
      const nextStatus = next.status ?? status;
      const nextKind = next.kind ?? kind;
      const params = new URLSearchParams(searchParams.toString());

      if (nextStatus === DEFAULT_STATUS) params.delete("status");
      else params.set("status", nextStatus);

      if (nextKind === DEFAULT_KIND) params.delete("kind");
      else params.set("kind", nextKind);

      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false
      });
    },
    [status, kind, pathname, router, searchParams]
  );

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (status !== DEFAULT_STATUS) {
    chips.push({
      key: "status",
      label: `Status: ${STATUS_CHIP_LABEL[status]}`,
      onRemove: () => setParams({ status: DEFAULT_STATUS })
    });
  }
  if (kind !== DEFAULT_KIND) {
    chips.push({
      key: "kind",
      label: `Art: ${KIND_CHIP_LABEL[kind]}`,
      onRemove: () => setParams({ kind: DEFAULT_KIND })
    });
  }

  const kindActiveCount = kind !== DEFAULT_KIND ? 1 : 0;

  return (
    <div className="md:hidden space-y-3">
      <div className="flex items-stretch gap-2">
        <SegmentedControl
          options={STATUS_OPTIONS}
          value={status}
          onValueChange={(v) => setParams({ status: v as FilterStatus })}
          size="sm"
          ariaLabel="Status filtern"
          className="min-w-0 flex-1"
        />
        <FilterSheet
          title="Pacts filtern"
          triggerLabel="Art"
          activeCount={kindActiveCount}
          triggerClassName="shrink-0"
          onReset={
            kindActiveCount > 0
              ? () => setParams({ kind: DEFAULT_KIND })
              : undefined
          }
        >
          <div>
            <div className="mb-2 text-[0.7rem] font-bold uppercase tracking-widest text-brand-night-navy/40">
              Art
            </div>
            <SegmentedControl
              options={KIND_OPTIONS}
              value={kind}
              onValueChange={(v) => setParams({ kind: v as FilterKind })}
              size="sm"
              ariaLabel="Art filtern"
            />
          </div>
        </FilterSheet>
      </div>

      <ActiveFilterChips chips={chips} />
    </div>
  );
}
