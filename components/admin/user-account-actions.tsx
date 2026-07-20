"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  resendMagicLinkAction,
  setUserDeletionAction,
  anonymizeUserNowAction
} from "@/app/admin/(panel)/users/_actions/actions";

export function UserAccountActions({
  userId,
  isPlatformAdmin,
  deletionRequested
}: {
  userId: string;
  isPlatformAdmin: boolean;
  deletionRequested: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, successMsg: string) {
    setPending(key);
    const res = await fn();
    setPending(null);
    if (res.ok) {
      toast.success(successMsg);
      router.refresh();
    } else {
      toast.error(res.error ?? "Fehlgeschlagen");
    }
  }

  async function anonymize() {
    const ok = await confirm({
      title: "Diesen Account jetzt anonymisieren?",
      description: "Das ist nicht umkehrbar.",
      confirmLabel: "Anonymisieren",
      danger: true
    });
    if (!ok) return;
    run("anon", () => anonymizeUserNowAction({ userId }), "Account anonymisiert");
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      <div className="flex flex-wrap gap-2">
        {!isPlatformAdmin && (
          <Button
            variant="outline"
            disabled={pending !== null}
            onClick={() =>
              run("magic", () => resendMagicLinkAction({ userId }), "Magic-Link gesendet")
            }
          >
            {pending === "magic" ? "Sende..." : "Magic-Link erneut senden"}
          </Button>
        )}
        {deletionRequested ? (
          <Button
            variant="outline"
            disabled={pending !== null}
            onClick={() =>
              run(
                "cancel",
                () => setUserDeletionAction({ userId, requested: false }),
                "Löschantrag zurückgenommen"
              )
            }
          >
            {pending === "cancel" ? "..." : "Löschantrag zurücknehmen"}
          </Button>
        ) : (
          <Button
            variant="outline"
            disabled={pending !== null}
            onClick={() =>
              run(
                "request",
                () => setUserDeletionAction({ userId, requested: true }),
                "Löschung beantragt (14 Tage)"
              )
            }
          >
            {pending === "request" ? "..." : "Löschung beantragen (14 Tage)"}
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4">
        <p className="text-sm font-semibold text-rose-800">Gefahrenzone</p>
        <p className="mt-1 text-xs text-rose-700/80">
          Sofortige Anonymisierung (DSGVO Art. 17): E-Mail/Name werden zum Tombstone, Login wird
          entfernt, Sponsor-Profile anonymisiert. Rechnungsdaten bleiben (§ 147 AO). Nicht umkehrbar.
        </p>
        <Button
          variant="destructive"
          className="mt-3"
          disabled={pending !== null}
          onClick={anonymize}
        >
          {pending === "anon" ? "Anonymisiere..." : "Jetzt anonymisieren"}
        </Button>
      </div>
    </div>
  );
}
