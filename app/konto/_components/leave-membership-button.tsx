"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  leaveClubMembershipAction,
  leaveTeamMembershipAction
} from "@/lib/actions/team-membership";

/**
 * B5 (Audit 2026-06-11): Self-Service-Austritt aus Verein/Mannschaft auf der
 * Konto-Seite — mit Bestätigungs-Dialog. Der letzte Admin wird serverseitig
 * geblockt ({ok:false,message} → Toast).
 */
export function LeaveMembershipButton({
  kind,
  id,
  name
}: {
  kind: "club" | "team";
  /** clubId bzw. teamId */
  id: string;
  name: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const noun = kind === "club" ? "Verein" : "Mannschaft";

  function onConfirm() {
    startTransition(async () => {
      const res =
        kind === "club"
          ? await leaveClubMembershipAction({ clubId: id })
          : await leaveTeamMembershipAction({ teamId: id });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(`Du hast ${name} verlassen.`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="shrink-0 text-xs font-semibold text-brand-night-navy/50 underline hover:text-brand-alert-red"
        >
          Verlassen
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display font-bold text-xl tracking-tight">
            {noun} verlassen?
          </DialogTitle>
          <DialogDescription>
            Du verlierst den Zugriff auf {name}. Ein Admin kann dich jederzeit
            wieder einladen — oder du stellst eine neue Zugriff-Anfrage.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Verlasse…" : "Ja, verlassen"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
