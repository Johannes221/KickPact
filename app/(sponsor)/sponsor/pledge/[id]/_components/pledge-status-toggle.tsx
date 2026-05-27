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
      else toast.success(isPaused ? "Pledge reaktiviert ✓" : "Pledge pausiert.");
    });
  }

  function handleEnd() {
    setShowEndDialog(false);
    startTransition(async () => {
      const res = await setPledgeStatus(pledgeId, "ended");
      if (res.error) toast.error(res.error);
      else toast.success("Wette beendet.");
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
          {pending ? "…" : isPaused ? "Pledge reaktivieren" : "Pledge pausieren"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => setShowEndDialog(true)}
          className="text-red-600 border-red-200 hover:bg-red-50 hover:border-red-400"
        >
          Wette beenden
        </Button>
      </div>

      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wette endgültig beenden?</DialogTitle>
            <DialogDescription>
              Die Wette wird sofort beendet — das ist nicht rückgängig zu machen.
              Bereits gebuchte Charges bleiben erhalten, aber es werden keine
              neuen Trigger-Events mehr ausgelöst.
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
              {pending ? "…" : "Ja, Wette beenden"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
