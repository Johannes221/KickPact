"use client";

import { useTransition, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cancelAccountDeletion } from "@/lib/actions/dsgvo";

export interface DeletionBannerProps {
  requestedAt: Date;
  scheduledFor: Date;
}

export function DeletionBanner({ scheduledFor }: DeletionBannerProps) {
  const [isPending, startTransition] = useTransition();
  // #418-Guard: Date.now()-basierte Restzeit erst nach dem Mount rechnen.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  function handleCancel() {
    startTransition(async () => {
      const res = await cancelAccountDeletion();
      if (res.ok) {
        toast.success("Account-Löschung abgebrochen.");
        window.location.reload();
      } else {
        toast.error(res.error ?? "Abbruch fehlgeschlagen");
      }
    });
  }

  const daysLeft = mounted
    ? Math.max(
        0,
        Math.ceil((scheduledFor.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      )
    : null;

  return (
    <div className="rounded-2xl border border-brand-alert-red/40 bg-brand-alert-red/5 p-4 md:p-5">
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0" aria-hidden>
          ⚠️
        </span>
        <div className="flex-1 min-w-0 space-y-2">
          <div>
            <div className="font-semibold text-sm text-brand-alert-red">
              Account-Löschung läuft
            </div>
            <p className="mt-1 text-xs text-brand-night-navy/70">
              Anonymisierung am{" "}
              <strong>
                {scheduledFor.toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "long",
                  year: "numeric"
                })}
              </strong>
              {daysLeft !== null
                ? ` (${daysLeft} ${daysLeft === 1 ? "Tag" : "Tage"} verbleibend)`
                : ""}
              . Du kannst dich weiterhin einloggen und den Vorgang jederzeit
              stoppen.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={isPending}
            className="border-brand-alert-red/40 text-brand-alert-red hover:bg-brand-alert-red/10"
          >
            {isPending ? "Breche ab…" : "Löschung stoppen"}
          </Button>
        </div>
      </div>
    </div>
  );
}
