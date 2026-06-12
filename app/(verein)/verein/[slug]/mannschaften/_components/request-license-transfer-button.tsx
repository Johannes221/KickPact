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
import { requestLicenseTransfer } from "@/lib/actions/license-transfers";

/**
 * Paket B (Spec §1.5): CTA „Unter Vereinslizenz anfragen" für bestehende
 * autarke Mannschaften des Vereins — mit Bestätigungs-Dialog. Die Anfrage
 * geht an den aktuellen Lizenz-Inhaber der Mannschaft, der in „Mein Konto"
 * entscheidet.
 */
export function RequestLicenseTransferButton({
  clubSlug,
  teamId,
  teamName
}: {
  clubSlug: string;
  teamId: string;
  teamName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      const res = await requestLicenseTransfer({ clubSlug, teamId });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success(res.message ?? "Anfrage verschickt.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="shrink-0">
          Unter Vereinslizenz anfragen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>„{teamName}" unter die Vereinslizenz nehmen?</DialogTitle>
          <DialogDescription>
            Der aktuelle Lizenz-Inhaber der Mannschaft bekommt eine Anfrage und
            entscheidet: Annehmen, Co-Verwaltung oder Ablehnen. Bei Annahme
            läuft sein Abo bis zum Periodenende weiter und endet dann
            automatisch — ab dann deckt eure Vereinslizenz die Mannschaft ab.
            Das Rechnungs-Branding wechselt sofort auf euren Verein.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Abbrechen
          </Button>
          <Button onClick={onConfirm} disabled={pending}>
            {pending ? "Wird verschickt…" : "Anfrage senden"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
