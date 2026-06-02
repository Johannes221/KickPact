"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { assignTicketAction } from "@/app/admin/(panel)/support/_actions/actions";

export interface AssignOption {
  id: string;
  label: string;
}

export function SupportAssignControl({
  ticketId,
  current,
  options
}: {
  ticketId: string;
  current: string | null;
  options: AssignOption[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [value, setValue] = useState(current ?? "");

  async function change(next: string) {
    setValue(next);
    setPending(true);
    const res = await assignTicketAction({ ticketId, assignedToUserId: next });
    setPending(false);
    if (res.ok) {
      toast.success(next ? "Zugewiesen" : "Zuweisung entfernt");
      router.refresh();
    } else {
      toast.error(res.error ?? "Fehlgeschlagen");
      setValue(current ?? "");
    }
  }

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => change(e.target.value)}
      className="flex h-9 w-full max-w-xs rounded-md border border-brand-neutral/40 bg-white px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <option value="">— Nicht zugewiesen —</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
