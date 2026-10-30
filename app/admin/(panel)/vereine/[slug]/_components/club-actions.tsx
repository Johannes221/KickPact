"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useConfirm, type ConfirmOptions } from "@/components/ui/confirm-dialog";
import {
  blockClubAction,
  pauseClubSubscriptionAction,
  revokeClubVerificationAction,
  manualVerifyClubAction,
  resumeSubscriptionAction
} from "../../_actions/club-actions";

export function ClubActions({
  clubSlug,
  verified,
  subStatus
}: {
  clubSlug: string;
  verified: boolean;
  subStatus: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const { confirm, confirmDialog } = useConfirm();
  const canResume = subStatus === "paused" || subStatus === "cancelled";

  async function run<T extends { ok: boolean; error?: string }>(
    fn: () => Promise<T>,
    successMsg: string,
    confirmOpts?: ConfirmOptions
  ) {
    if (confirmOpts && !(await confirm(confirmOpts))) return;
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.ok) toast.error(res.error ?? "Fehler");
        else toast.success(successMsg);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Unerwarteter Fehler");
      }
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {confirmDialog}
      {!verified && (
        <Button
          size="sm"
          variant="accent"
          disabled={pending}
          onClick={() =>
            run(
              () => manualVerifyClubAction({ clubSlug }),
              "Verein manuell verifiziert",
              {
                title: "Verein ohne Dokument manuell verifizieren?",
                description: "Zurückgehaltene Rechnungen werden freigegeben.",
                confirmLabel: "Verifizieren"
              }
            )
          }
        >
          Manuell verifizieren
        </Button>
      )}
      {canResume && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            run(
              () => resumeSubscriptionAction({ clubSlug }),
              "Abo fortgesetzt (active)",
              {
                title: "Abo wirklich fortsetzen?",
                description: "Status wird auf 'active' gesetzt.",
                confirmLabel: "Fortsetzen"
              }
            )
          }
        >
          Abo fortsetzen
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          run(
            () => pauseClubSubscriptionAction({ clubSlug }),
            "Subscription pausiert",
            {
              title: "Subscription wirklich pausieren?",
              confirmLabel: "Pausieren"
            }
          )
        }
      >
        Sub pausieren
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          run(
            () => revokeClubVerificationAction({ clubSlug }),
            "Verifikation revoked",
            {
              title: "Verifikation wirklich revoken?",
              description: "Verein muss neu hochladen.",
              confirmLabel: "Revoken",
              danger: true
            }
          )
        }
      >
        Verifikation revoken
      </Button>
      <Button
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() =>
          run(
            () => blockClubAction({ clubSlug }),
            "Verein blockiert (sub=cancelled)",
            {
              title: "Verein wirklich blocken?",
              description: "Subscription wird auf 'cancelled' gesetzt.",
              confirmLabel: "Blocken",
              danger: true
            }
          )
        }
      >
        Verein blocken
      </Button>
    </div>
  );
}
