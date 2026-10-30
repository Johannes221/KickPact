"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  adminApproveRequestAction,
  adminRejectRequestAction
} from "../../_actions/membership-requests";

type ActionResult = { ok: true } | { ok: false; error: string };

interface PendingRequest {
  id: string;
  requesterEmail: string;
  requestedRole: "admin" | "trainer" | "viewer";
  requestedTeamName: string | null;
  message: string | null;
  createdAt: Date;
}

const ROLE_LABEL: Record<"admin" | "trainer" | "viewer", string> = {
  admin: "Admin",
  trainer: "Trainer",
  viewer: "Viewer"
};

export function AdminRequestsTable({
  clubSlug,
  requests
}: {
  clubSlug: string;
  requests: PendingRequest[];
}) {
  const [pending, startTransition] = useTransition();
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const { confirm, confirmDialog } = useConfirm();

  async function onApprove(r: PendingRequest) {
    const ok = await confirm({
      title: "Zugriffsanfrage annehmen?",
      description: `${r.requesterEmail} bekommt ${ROLE_LABEL[r.requestedRole]}-Zugriff${
        r.requestedTeamName ? ` auf ${r.requestedTeamName}` : " auf den ganzen Verein"
      }. Als Operator-Aktion wird das protokolliert.`,
      confirmLabel: "Annehmen"
    });
    if (!ok) return;
    startTransition(async () => {
      const res: ActionResult = await adminApproveRequestAction({
        requestId: r.id,
        clubSlug
      });
      if (!res.ok) toast.error(res.error);
      else toast.success("Zugriff freigegeben");
    });
  }

  function onReject(id: string) {
    startTransition(async () => {
      const res: ActionResult = await adminRejectRequestAction({
        requestId: id,
        clubSlug,
        reason: reason.trim() || undefined
      });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Abgelehnt");
        setRejectFor(null);
        setReason("");
      }
    });
  }

  if (requests.length === 0) {
    return <p className="text-sm text-brand-night-navy/60">Keine offenen Anfragen.</p>;
  }

  return (
    <>
      {confirmDialog}
      <ul className="space-y-3">
        {requests.map((r) => (
          <li key={r.id} className="rounded-2xl border border-brand-neutral/40 bg-white p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-brand-night-navy truncate">
                  {r.requesterEmail}
                </div>
                <div className="mt-1 text-xs text-brand-night-navy/60">
                  Möchte <strong>{ROLE_LABEL[r.requestedRole]}</strong>-Zugriff{" "}
                  {r.requestedTeamName ? (
                    <>für <strong>{r.requestedTeamName}</strong></>
                  ) : (
                    <>für den ganzen Verein</>
                  )}
                </div>
                {r.message && (
                  <blockquote className="mt-2 border-l-2 border-accent/40 pl-3 text-xs text-brand-night-navy/70 italic">
                    „{r.message}"
                  </blockquote>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="accent"
                  disabled={pending}
                  onClick={() => onApprove(r)}
                >
                  Annehmen
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setRejectFor(rejectFor === r.id ? null : r.id);
                    setReason("");
                  }}
                >
                  {rejectFor === r.id ? "Abbrechen" : "Ablehnen"}
                </Button>
              </div>
            </div>
            {rejectFor === r.id && (
              <div className="mt-3 space-y-2">
                <Textarea
                  placeholder="Optional: Grund für die Ablehnung (wird dem Anfragenden gemailt)"
                  maxLength={280}
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => onReject(r.id)}
                >
                  Ablehnen bestätigen
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
