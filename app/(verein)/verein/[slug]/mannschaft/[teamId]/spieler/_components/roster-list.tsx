"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { togglePlayerBlock } from "@/lib/actions/team-lifecycle";
import type { RosterPlayer } from "@/lib/db/queries/team-lifecycle";

interface Props {
  players: RosterPlayer[];
  canEdit: boolean;
  clubSlug: string;
  teamId: string;
}

export function RosterList({ players, canEdit }: Props) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { confirm, confirmDialog } = useConfirm();

  async function handleToggle(player: RosterPlayer) {
    const nextBlocked = !player.blocked;
    const ok = await confirm(
      nextBlocked
        ? {
            title: `${player.name} anonymisieren?`,
            description:
              "Der Name wird überall durch Anonymisiert ersetzt — auch in bereits erfassten Spielereignissen.",
            confirmLabel: "Anonymisieren",
            danger: true
          }
        : {
            title: "Spieler entblocken?",
            description:
              "Beim nächsten Datenabgleich wird der echte Name wiederhergestellt.",
            confirmLabel: "Entblocken"
          }
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

  return (
    <>
      {confirmDialog}
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
    </>
  );
}
