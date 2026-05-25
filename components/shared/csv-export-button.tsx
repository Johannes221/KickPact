"use client";

/**
 * CsvExportButton — triggert einen Download eines Server-CSV-Endpoints.
 *
 * Verhalten:
 *   - Liest die aktuellen `useSearchParams` (Filter + Sort) und hängt sie an
 *     den Export-Endpoint dran (zusätzlich zu `?slug=...`-prop).
 *   - Strippt `page` und `pageSize` — Export ist immer das vollständige Set.
 *   - Statt `window.open` (wird oft als Popup geblockt) erzeugen wir einen
 *     `<a>`-Element-Click, der `download="..."`-Hint trägt; der Browser
 *     speichert das File. `fetch` mit blob() wäre auch eine Option, würde
 *     aber großen Datensätzen vorab in Memory laden — weniger ideal.
 */

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CsvExportButtonProps {
  /** Export-Endpoint, z.B. `/api/exports/charges`. */
  endpoint: string;
  /** Verein-Slug, wird als `?slug=…` mitgesendet (für Auth-Scope). */
  slug: string;
  /** Optional: zusätzliche statische Query-Params (z.B. `sponsorId`). */
  extraParams?: Record<string, string>;
  /** Label, default "CSV". */
  label?: string;
  className?: string;
  /** Visual variant for the underlying Button. */
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}

export function CsvExportButton({
  endpoint,
  slug,
  extraParams,
  label = "CSV",
  className,
  variant = "outline",
  size = "sm"
}: CsvExportButtonProps) {
  const searchParams = useSearchParams();

  function buildUrl(): string {
    const next = new URLSearchParams();
    next.set("slug", slug);
    if (extraParams) {
      for (const [k, v] of Object.entries(extraParams)) next.set(k, v);
    }
    // Übernehme Filter aus der URL — strippe Pagination-Keys.
    for (const [k, v] of Array.from(searchParams.entries())) {
      if (k === "page" || k === "pageSize") continue;
      if (!next.has(k)) next.set(k, v);
    }
    return `${endpoint}?${next.toString()}`;
  }

  function handleClick() {
    const url = buildUrl();
    // Programmatischer Click auf ein hidden Anchor → triggert Download ohne
    // Popup-Blocker zu wecken.
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    // Browser nutzt Content-Disposition-Header der Response für den Filename.
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleClick}
      className={cn("gap-1.5", className)}
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
