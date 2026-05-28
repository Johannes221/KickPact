"use client";

import { useTransition, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { triggerManualInvoiceAction } from "../../_actions/manual-invoice";

export function InvoiceTriggerButton() {
  const [pending, startTransition] = useTransition();
  const [period, setPeriod] = useState("");

  function onClick() {
    startTransition(async () => {
      const res = await triggerManualInvoiceAction({
        period: period.trim() || undefined
      });
      if (!res.ok) toast.error(res.error);
      else toast.success("Job gestartet — Rechnungen werden generiert");
    });
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
      <div className="flex-1 max-w-xs">
        <span className="block text-xs text-brand-night-navy/60 font-semibold mb-1">
          Zeitraum{" "}
          <span className="font-normal opacity-60">— optional</span>
        </span>
        <Input
          placeholder="z.B. 2026-04, leer = letzter Monat"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !pending && onClick()}
          disabled={pending}
        />
      </div>
      <Button variant="accent" disabled={pending} onClick={onClick}>
        {pending ? "…" : "Rechnungen jetzt generieren"}
      </Button>
    </div>
  );
}
