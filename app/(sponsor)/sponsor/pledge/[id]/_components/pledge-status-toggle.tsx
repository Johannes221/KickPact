"use client";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
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

  if (currentStatus === "ended") return null;

  const isPaused = currentStatus === "paused";

  function toggle() {
    startTransition(async () => {
      const res = await setPledgeStatus(pledgeId, isPaused ? "active" : "paused");
      if (res.error) toast.error(res.error);
      else toast.success(isPaused ? "Pledge reaktiviert ✓" : "Pledge pausiert.");
    });
  }

  return (
    <Button
      variant={isPaused ? "accent" : "outline"}
      size="sm"
      disabled={pending}
      onClick={toggle}
    >
      {pending ? "…" : isPaused ? "Pledge reaktivieren" : "Pledge pausieren"}
    </Button>
  );
}
