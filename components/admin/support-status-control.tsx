"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { setSupportStatusAction } from "@/app/admin/(panel)/support/_actions/actions";

type Status = "open" | "in_progress" | "waiting" | "closed";

const STATUS_LABELS: Record<Status, string> = {
  open: "Offen",
  in_progress: "In Bearbeitung",
  waiting: "Wartet auf Absender",
  closed: "Geschlossen"
};

export function SupportStatusControl({
  ticketId,
  current
}: {
  ticketId: string;
  current: Status;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function change(status: Status) {
    if (status === current || pending) return;
    setPending(true);
    const res = await setSupportStatusAction({ ticketId, status });
    setPending(false);
    if (res.ok) {
      toast.success(`Status: ${STATUS_LABELS[status]}`);
      router.refresh();
    } else {
      toast.error(res.error ?? "Fehlgeschlagen");
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => change(s)}
          disabled={pending}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
            s === current
              ? "bg-brand-night-navy text-white"
              : "bg-brand-off-white text-brand-night-navy/70 hover:bg-white border border-brand-neutral/40"
          }`}
        >
          {STATUS_LABELS[s]}
        </button>
      ))}
    </div>
  );
}
