"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { requestTeamCrawlAction } from "@/lib/actions/request-crawl";
import { PullToRefresh } from "@/components/native/pull-to-refresh";

interface Props {
  slug: string;
  teamId: string;
  /** Server-seitiger Crawl-Status zum Render-Zeitpunkt. */
  isCrawling: boolean;
  /** Aktuell gerenderte Spiele (für „neue Spiele erschienen"-Erkennung). */
  matchCount: number;
}

/**
 * „Spiele aktualisieren" für die App: Button stößt einen On-Demand-Crawl an,
 * zeigt einen klaren „lädt — kann ein paar Minuten dauern"-Status und pollt den
 * Crawl-Status. Sobald neue Spiele da sind oder der Crawl fertig ist →
 * `router.refresh()` (neue Spiele erscheinen automatisch).
 */
export function SpieleRefresh({ slug, teamId, isCrawling, matchCount }: Props) {
  const router = useRouter();
  const [crawling, setCrawling] = useState(isCrawling);
  const matchCountRef = useRef(matchCount);
  matchCountRef.current = matchCount;

  // Server-Status gewinnt (z.B. nach router.refresh()).
  useEffect(() => {
    setCrawling(isCrawling);
  }, [isCrawling]);

  // Poller: solange ein Crawl läuft, alle 5 s Status holen.
  useEffect(() => {
    if (!crawling) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/teams/${teamId}/crawl-status`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { isCrawling: boolean; matchCount: number };
        if (cancelled) return;
        if (data.matchCount !== matchCountRef.current) router.refresh();
        if (!data.isCrawling) {
          setCrawling(false);
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
  }, [crawling, teamId, router]);

  const handleRefresh = useCallback(async () => {
    setCrawling(true);
    const res = await requestTeamCrawlAction({ slug, teamId });
    if (!res.ok) {
      toast.error(res.error);
      setCrawling(false);
      return;
    }
    toast.success("Aktualisierung gestartet.");
  }, [slug, teamId]);

  return (
    <div className="space-y-2">
      {/* Native iOS-Geste: Runterziehen am oberen Rand löst denselben Crawl aus
          wie der Button. Im Browser rendert die Komponente nichts. */}
      <PullToRefresh onRefresh={handleRefresh} disabled={crawling} />
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={crawling}
          className="gap-1.5"
        >
          {crawling ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {crawling ? "Lädt…" : "Aktualisieren"}
        </Button>
      </div>
      {crawling && (
        <div className="flex items-center gap-2.5 rounded-xl border border-accent/30 bg-accent/5 px-3.5 py-2.5 text-sm text-brand-night-navy/70">
          <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-accent" aria-hidden />
          <span>
            Spiele werden geladen — das kann ein paar Minuten dauern. Neue Spiele
            erscheinen automatisch.
          </span>
        </div>
      )}
    </div>
  );
}
