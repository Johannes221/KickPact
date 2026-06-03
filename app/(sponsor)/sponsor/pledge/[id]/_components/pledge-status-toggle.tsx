"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { setPledgeStatus } from "@/lib/actions/pledges";

export function PledgeStatusToggle({
  pledgeId,
  currentStatus
}: {
  pledgeId: string;
  currentStatus: string;
}) {
  const [pending, startTransition] = useTransition();
  const [showEndDialog, setShowEndDialog] = useState(false);

  if (currentStatus === "ended") return null;

  const isPaused = currentStatus === "paused";

  function toggle() {
    startTransition(async () => {
      const res = await setPledgeStatus(pledgeId, isPaused ? "active" : "paused");
      if (res.error) toast.error(res.error);
      else toast.success(isPaused ? "Pact reaktiviert ✓" : "Pact pausiert.");
    });
  }

  function handleEnd() {
    setShowEndDialog(false);
    startTransition(async () => {
      const res = await setPledgeStatus(pledgeId, "ended");
      if (res.error) toast.error(res.error);
      else toast.success("Pact beendet.");
    });
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap justify-end">
        <Button
          variant={isPaused ? "accent" : "outline"}
          size="sm"
          disabled={pending}
          onClick={toggle}
        >
          {pending ? "…" : isPaused ? "Pact reaktivieren" : "Pact pausieren"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => setShowEndDialog(true)}
          className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-400"
        >
          Pact beenden
        </Button>
      </div>

      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pact endgültig beenden?</DialogTitle>
            <DialogDescription>
              Der Pact wird sofort beendet — das ist nicht rückgängig zu machen.
              Bereits gebuchte Beiträge bleiben erhalten, aber es werden keine
              neuen Ereignisse mehr ausgelöst.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowEndDialog(false)}
              disabled={pending}
            >
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={handleEnd}
              disabled={pending}
            >
              {pending ? "…" : "Ja, Pact beenden"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
