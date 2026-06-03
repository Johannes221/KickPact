"use client";

import { useState, useTransition } from "react";
import { Check, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updatePledgeCap } from "@/lib/actions/pledges";

function eurDisplay(cents: number) {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

export function PledgeCapEditor({
  pledgeId,
  currentCapCents,
  isEnded
}: {
  pledgeId: string;
  currentCapCents: number | null;
  isEnded: boolean;
}) {
  const [editing, setEditing] = useState(false);
  // Store input as a string so partial edits (e.g. "5," or "50.") work naturally
  const [value, setValue] = useState(
    currentCapCents ? String(currentCapCents / 100).replace(".", ",") : ""
  );
  const [pending, startTransition] = useTransition();

  if (isEnded) {
    return (
      <div className="font-display font-bold text-xl tracking-tight text-brand-night-navy">
        {currentCapCents ? eurDisplay(currentCapCents) : "ohne Cap"}
      </div>
    );
  }

  function save() {
    const normalized = value.trim().replace(",", ".");
    if (normalized === "") {
      // Remove cap
      startTransition(async () => {
        const res = await updatePledgeCap(pledgeId, null);
        if (res.error) { toast.error(res.error); return; }
        toast.success("Cap entfernt.");
        setEditing(false);
      });
      return;
    }
    const euros = parseFloat(normalized);
    if (isNaN(euros) || euros <= 0) {
      toast.error("Bitte einen positiven Betrag eingeben.");
      return;
    }
    const cents = Math.round(euros * 100);
    startTransition(async () => {
      const res = await updatePledgeCap(pledgeId, cents);
      if (res.error) { toast.error(res.error); return; }
      toast.success("Monats-Cap gespeichert.");
      setEditing(false);
    });
  }

  function cancel() {
    setValue(currentCapCents ? String(currentCapCents / 100).replace(".", ",") : "");
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="z.B. 50"
          className="w-24 h-8 text-sm font-mono"
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); save(); }
            if (e.key === "Escape") cancel();
          }}
          autoFocus
          disabled={pending}
        />
        <span className="text-brand-night-navy/50 text-sm">€</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={save}
          disabled={pending}
          title="Speichern"
        >
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={cancel}
          disabled={pending}
          title="Abbrechen"
        >
          <X className="h-3.5 w-3.5 text-red-500" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 group">
      <div className="font-display font-bold text-xl tracking-tight text-brand-night-navy">
        {currentCapCents ? eurDisplay(currentCapCents) : "ohne Cap"}
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-60 hover:opacity-100 transition-opacity"
        onClick={() => setEditing(true)}
        title="Cap bearbeiten"
      >
        <Pencil className="h-3 w-3" />
      </Button>
    </div>
  );
}
