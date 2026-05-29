"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  markInvoicePaidAction,
  sendInvoiceReminderAction,
  stornoInvoiceAction
} from "@/app/admin/(panel)/_actions/invoice-actions";

export function InvoiceRowActions({
  invoiceId,
  paid,
  canStorno
}: {
  invoiceId: string;
  paid: boolean;
  canStorno: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

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

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(
            () => markInvoicePaidAction({ invoiceId, paid: !paid }),
            paid ? "Als offen markiert" : "Als bezahlt markiert"
          )
        }
        className="rounded-md border border-brand-neutral/40 px-2 py-1 text-xs font-semibold text-brand-night-navy/70 hover:bg-brand-off-white"
      >
        {paid ? "Als offen" : "Als bezahlt"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => sendInvoiceReminderAction({ invoiceId }), "Erinnerung gesendet")}
        className="rounded-md border border-brand-neutral/40 px-2 py-1 text-xs font-semibold text-brand-night-navy/70 hover:bg-brand-off-white"
      >
        Erinnerung
      </button>
      {canStorno && (
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (
              !window.confirm(
                "Echte Stornorechnung (Gutschrift) erzeugen? Die Original-Rechnung wird als storniert markiert."
              )
            )
              return;
            run(() => stornoInvoiceAction({ invoiceId }), "Stornorechnung erzeugt");
          }}
          className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
        >
          Stornieren
        </button>
      )}
    </div>
  );
}
