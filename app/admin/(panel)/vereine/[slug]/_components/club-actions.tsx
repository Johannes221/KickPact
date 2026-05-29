"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  const canResume = subStatus === "paused" || subStatus === "cancelled";

  function run<T extends { ok: boolean; error?: string }>(
    fn: () => Promise<T>,
    successMsg: string,
    confirmMsg?: string
  ) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
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
      {!verified && (
        <Button
          size="sm"
          variant="accent"
          disabled={pending}
          onClick={() =>
            run(
              () => manualVerifyClubAction({ clubSlug }),
              "Verein manuell verifiziert",
              "Verein OHNE Dokument manuell verifizieren? Zurückgehaltene Rechnungen werden freigegeben."
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
              "Abo wirklich fortsetzen (status=active)?"
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
            "Subscription wirklich pausieren?"
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
            "Verifikation wirklich revoken? Verein muss neu hochladen."
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
            "Verein wirklich blocken? Subscription wird auf 'cancelled' gesetzt."
          )
        }
      >
        Verein blocken
      </Button>
    </div>
  );
}
