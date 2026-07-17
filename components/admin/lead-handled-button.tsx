"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setLeadHandledAction } from "@/app/admin/(panel)/leads/_actions/actions";

export function LeadHandledButton({
  leadId,
  handled
}: {
  leadId: string;
  handled: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handle() {
    setPending(true);
    const res = await setLeadHandledAction({ leadId, handled: !handled });
    setPending(false);
    if (res.ok) {
      toast.success(res.handled ? "Als erledigt markiert" : "Wieder geöffnet", {
        action: {
          label: "Rückgängig",
          onClick: async () => {
            const undo = await setLeadHandledAction({ leadId, handled });
            if (undo.ok) router.refresh();
            else toast.error(undo.error ?? "Rückgängig fehlgeschlagen");
          }
        }
      });
      router.refresh();
    } else {
      toast.error(res.error ?? "Fehlgeschlagen");
    }
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      aria-pressed={handled}
      className="rounded-lg border border-brand-neutral/40 px-2.5 py-1 text-xs font-semibold text-brand-night-navy/70 transition-colors hover:bg-brand-off-white hover:text-brand-night-navy focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-night-navy disabled:opacity-50"
    >
      {handled ? "Wieder öffnen" : "Erledigt"}
    </button>
  );
}
