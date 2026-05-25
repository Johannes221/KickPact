"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  togglePlayerBlock,
  generatePlayerOptOutLink
} from "@/lib/actions/team-lifecycle";
import type { RosterPlayer } from "@/lib/db/queries/team-lifecycle";

interface Props {
  players: RosterPlayer[];
  canEdit: boolean;
  isAdmin: boolean;
  clubSlug: string;
  teamId: string;
}

export function RosterList({ players, canEdit, isAdmin }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleToggle(player: RosterPlayer) {
    const nextBlocked = !player.blocked;
    const ok = window.confirm(
      nextBlocked
        ? `Spieler "${player.name}" wirklich anonymisieren? Der Name wird durch "Anonymisiert" ersetzt.`
        : `Spieler entblocken? Beim nächsten Crawl wird der echte Name wiederhergestellt.`
    );
    if (!ok) return;
    setBusyId(player.id);
    startTransition(async () => {
      try {
        await togglePlayerBlock({ playerId: player.id, desired: nextBlocked });
        toast.success(
          nextBlocked ? "Spieler anonymisiert." : "Spieler entblockt."
        );
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler.");
      } finally {
        setBusyId(null);
      }
    });
  }

  async function handleCopyOptOutLink(player: RosterPlayer) {
    setBusyId(player.id);
    try {
      const { url } = await generatePlayerOptOutLink(player.id);
      await navigator.clipboard.writeText(url);
      toast.success("Opt-out-Link in Zwischenablage kopiert.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Fehler.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ul className="space-y-2">
      {players.map((p) => (
        <li
          key={p.id}
          className={
            "flex items-center justify-between gap-3 rounded-lg border p-3 md:p-4 " +
            (p.blocked
              ? "border-amber-200 bg-amber-50/60"
              : "border-brand-neutral/40 bg-white")
          }
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={
                  "font-semibold truncate " +
                  (p.blocked
                    ? "text-brand-night-navy/60 italic"
                    : "text-brand-night-navy")
                }
              >
                {p.blocked ? "— Anonymisiert —" : p.name}
              </span>
              {p.blocked && (
                <span className="inline-flex items-center rounded-full bg-amber-200 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-widest text-amber-900">
                  Geblockt
                </span>
              )}
            </div>
            <div className="text-xs text-brand-night-navy/50 mt-0.5">
              {p.matchEventCount} Event{p.matchEventCount === 1 ? "" : "s"}
            </div>
          </div>
          {canEdit && (
            <div className="flex gap-2 shrink-0">
              {isAdmin && !p.blocked && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleCopyOptOutLink(p)}
                  disabled={pending && busyId === p.id}
                >
                  Opt-out-Link
                </Button>
              )}
              <Button
                variant={p.blocked ? "accent" : "outline"}
                size="sm"
                onClick={() => handleToggle(p)}
                disabled={pending && busyId === p.id}
                className={
                  p.blocked
                    ? ""
                    : "text-brand-alert-red border-brand-alert-red/40 hover:bg-brand-alert-red/5"
                }
              >
                {pending && busyId === p.id
                  ? "…"
                  : p.blocked
                    ? "Entblocken"
                    : "Anonymisieren"}
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
