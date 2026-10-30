"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  updateTeamAction,
  manualVerifyTeamAction
} from "@/app/admin/(panel)/vereine/_actions/club-actions";

export function TeamRowActions({
  teamId,
  name,
  isActive,
  discoverable,
  verified
}: {
  teamId: string;
  name: string;
  isActive: boolean;
  discoverable: boolean;
  verified: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const { confirm, confirmDialog } = useConfirm();

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    setPending(true);
    const res = await fn();
    setPending(false);
    if (res.ok) {
      toast.success(msg);
      router.refresh();
    } else {
      toast.error(res.error ?? "Fehlgeschlagen");
    }
  }

  function editName() {
    const next = window.prompt("Team-Name:", name);
    if (next == null || next.trim() === "" || next.trim() === name) return;
    run(() => updateTeamAction({ teamId, name: next.trim() }), "Name gespeichert");
  }

  async function verifyTeam() {
    const ok = await confirm({
      title: "Team manuell verifizieren?",
      description: "Zurückgehaltene Rechnungen werden freigegeben.",
      confirmLabel: "Verifizieren"
    });
    if (!ok) return;
    run(() => manualVerifyTeamAction({ teamId }), "Team verifiziert");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {confirmDialog}
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => updateTeamAction({ teamId, isActive: !isActive }), "Aktiv-Status geändert")}
        className="rounded-md border border-brand-neutral/40 px-2 py-1 text-xs font-semibold text-brand-night-navy/70 hover:bg-brand-off-white"
      >
        {isActive ? "Deaktivieren" : "Aktivieren"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(() => updateTeamAction({ teamId, discoverable: !discoverable }), "Discover geändert")
        }
        className="rounded-md border border-brand-neutral/40 px-2 py-1 text-xs font-semibold text-brand-night-navy/70 hover:bg-brand-off-white"
      >
        {discoverable ? "Nicht öffentlich" : "Öffentlich"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={editName}
        className="rounded-md border border-brand-neutral/40 px-2 py-1 text-xs font-semibold text-brand-night-navy/70 hover:bg-brand-off-white"
      >
        Name
      </button>
      {!verified && (
        <button
          type="button"
          disabled={pending}
          onClick={verifyTeam}
          className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
        >
          Verifizieren
        </button>
      )}
    </div>
  );
}
