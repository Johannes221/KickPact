"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cancelChargeAction } from "@/app/admin/(panel)/sponsoring/_actions/actions";

export function ChargeCancelButton({ chargeId }: { chargeId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handle() {
    const reason = window.prompt("Grund für die Stornierung:");
    if (reason == null || reason.trim().length < 3) {
      if (reason !== null) toast.error("Grund mind. 3 Zeichen");
      return;
    }
    setPending(true);
    const res = await cancelChargeAction({ chargeId, reason: reason.trim() });
    setPending(false);
    if (res.ok) {
      toast.success("Charge storniert");
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
      className="text-xs font-semibold text-rose-700 hover:underline disabled:opacity-50"
    >
      Stornieren
    </button>
  );
}
