"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { IdentityIcon } from "@/components/shared/identity-icon";
import { setPrimaryRoleAction } from "../_actions/primary-role";

export interface PrimaryRoleOption {
  id: string;
  label: string;
  subline: string;
  kind: "club" | "team" | "sponsor";
}

/**
 * Auswahl der Hauptrolle — das Dashboard, in das der User direkt nach dem Login
 * springt (statt /select-role). Wird nur gerendert, wenn der User mehr als eine
 * Rolle hat; bei genau einer Rolle ist die Hauptrolle trivial.
 *
 * Optimistisch: die Auswahl springt sofort, ein Fehler rollt zurück.
 */
export function PrimaryRoleSelector({
  options,
  currentId
}: {
  options: PrimaryRoleOption[];
  currentId: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(currentId);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function choose(id: string) {
    if (id === selected || pending) return;
    const previous = selected;
    setSelected(id);
    startTransition(async () => {
      const res = await setPrimaryRoleAction(id);
      if (res.ok) {
        toast.success("Hauptrolle aktualisiert");
        router.refresh();
      } else {
        setSelected(previous);
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="rounded-xl border border-brand-neutral/30 bg-brand-off-white/60 p-3">
      <div className="mb-2 flex items-center gap-1.5">
        <Star className="h-3.5 w-3.5 text-accent" aria-hidden />
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-widest text-brand-night-navy/60">
          Hauptrolle
        </h3>
      </div>
      <p className="mb-3 text-xs text-brand-night-navy/60">
        Nach dem Login landest du direkt hier. Du kannst jederzeit über das Menü
        oben rechts wechseln.
      </p>
      <ul className="space-y-1.5" role="radiogroup" aria-label="Hauptrolle wählen">
        {options.map((opt) => {
          const active = opt.id === selected;
          return (
            <li key={opt.id}>
              <button
                type="button"
                role="radio"
                aria-checked={active}
                disabled={pending}
                onClick={() => choose(opt.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                  active
                    ? "border-accent bg-accent/5 ring-1 ring-accent/40"
                    : "border-brand-neutral/30 bg-white hover:border-accent/40",
                  pending && "opacity-60"
                )}
              >
                <IdentityIcon kind={opt.kind} className="h-7 w-7" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-brand-night-navy">
                    {opt.label}
                  </span>
                  <span className="block truncate text-[0.7rem] text-brand-night-navy/60">
                    {opt.subline}
                  </span>
                </span>
                {active && (
                  <Check className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
