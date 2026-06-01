"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { deactivateTeam, reactivateTeam } from "@/lib/actions/team-lifecycle";

interface Props {
  teamId: string;
  isActive: boolean;
}

export function TeamLifecyclePanel({ teamId, isActive }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function handleDeactivate() {
    startTransition(async () => {
      try {
        await deactivateTeam(teamId);
        setOpen(false);
        toast.success("Mannschaft deaktiviert.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler.");
      }
    });
  }

  function handleReactivate() {
    startTransition(async () => {
      try {
        await reactivateTeam(teamId);
        toast.success("Mannschaft reaktiviert.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler.");
      }
    });
  }

  if (!isActive) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Diese Mannschaft ist <strong>deaktiviert</strong>. Sie wird nicht mehr
          automatisch aktualisiert, neue Pacts sind blockiert.
        </div>
        <Button
          variant="accent"
          onClick={handleReactivate}
          disabled={pending}
        >
          {pending ? "Reaktiviere…" : "Mannschaft reaktivieren"}
        </Button>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-brand-alert-red border-brand-alert-red/40 hover:bg-brand-alert-red/5">
          Mannschaft deaktivieren
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mannschaft wirklich deaktivieren?</DialogTitle>
          <DialogDescription className="space-y-2 pt-2">
            <span className="block">
              Nach der Deaktivierung:
            </span>
            <span className="block">• Die Mannschaft wird nicht mehr automatisch aktualisiert</span>
            <span className="block">• Neue Sponsoring-Pacts sind blockiert</span>
            <span className="block">• Bestehende Pacts laufen zum Saisonende aus</span>
            <span className="block pt-1 text-xs text-brand-night-navy/60">
              Du kannst die Mannschaft jederzeit wieder aktivieren.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Abbrechen
          </Button>
          <Button
            variant="accent"
            onClick={handleDeactivate}
            disabled={pending}
            className="bg-brand-alert-red hover:bg-brand-alert-red/90"
          >
            {pending ? "Deaktiviere…" : "Ja, deaktivieren"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
