"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { setPriorityAction } from "@/app/admin/(panel)/support/_actions/actions";

type Priority = "low" | "normal" | "high" | "urgent";

const LABELS: Record<Priority, string> = {
  low: "Niedrig",
  normal: "Normal",
  high: "Hoch",
  urgent: "Dringend"
};

const ACTIVE_CLASS: Record<Priority, string> = {
  low: "bg-brand-night-navy text-white",
  normal: "bg-brand-night-navy text-white",
  high: "bg-orange-500 text-white",
  urgent: "bg-rose-600 text-white"
};

export function SupportPriorityControl({
  ticketId,
  current
}: {
  ticketId: string;
  current: Priority;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function change(priority: Priority) {
    if (priority === current || pending) return;
    setPending(true);
    const res = await setPriorityAction({ ticketId, priority });
    setPending(false);
    if (res.ok) {
      toast.success(`Priorität: ${LABELS[priority]}`);
      router.refresh();
    } else {
      toast.error(res.error ?? "Fehlgeschlagen");
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(LABELS) as Priority[]).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => change(p)}
          disabled={pending}
          className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
            p === current
              ? ACTIVE_CLASS[p]
              : "bg-brand-off-white text-brand-night-navy/70 hover:bg-white border border-brand-neutral/40"
          }`}
        >
          {LABELS[p]}
        </button>
      ))}
    </div>
  );
}
