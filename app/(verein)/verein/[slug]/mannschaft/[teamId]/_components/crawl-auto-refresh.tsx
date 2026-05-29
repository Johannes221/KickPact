"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

interface Props {
  teamId: string;
  /** Server-seitig ermittelter Crawl-Status zum Render-Zeitpunkt. */
  isCrawling: boolean;
  /** Anzahl der aktuell gerenderten Spiele (gedeckelt auf das Page-Limit). */
  matchCount: number;
}

/**
 * Unsichtbarer Poller: solange der Crawler für dieses Team läuft, fragt er alle
 * 5 Sekunden den Status ab. Sobald neue Spiele aufgetaucht sind (matchCount
 * steigt) ODER der Crawl fertig ist, triggert er `router.refresh()` — dadurch
 * re-rendert die Server-Component und neue Spiele „tauchen nach und nach auf".
 *
 * Stoppt automatisch, sobald `isCrawling` (nach einem Refresh) false wird, weil
 * der Effekt dann früh returnt und das Intervall im Cleanup gelöscht wird.
 */
export function CrawlAutoRefresh({ teamId, isCrawling, matchCount }: Props) {
  const router = useRouter();
  // Ref, damit das laufende Intervall immer den aktuellsten matchCount sieht,
  // ohne den Effekt (und damit das Intervall) bei jedem Refresh neu aufzusetzen.
  const matchCountRef = useRef(matchCount);
  matchCountRef.current = matchCount;

  useEffect(() => {
    if (!isCrawling) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/teams/${teamId}/crawl-status`, {
          cache: "no-store"
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          isCrawling: boolean;
          matchCount: number;
        };
        if (cancelled) return;
        // Neue Spiele angekommen oder Crawl beendet → Server-Component neu laden.
        if (data.matchCount !== matchCountRef.current || !data.isCrawling) {
          router.refresh();
        }
      } catch {
        // Netzwerk-Hänger ignorieren — nächster Tick versucht es erneut.
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isCrawling, teamId, router]);

  return null;
}
