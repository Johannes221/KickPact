"use client";

import { useState, useTransition } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { approveTeamAction, rejectTeamAction } from "../_actions/review";

export interface TeamRowProps {
  id: string;
  teamName: string;
  teamSaison: string;
  clubName: string;
  clubSlug: string;
  submitterEmail: string;
  submitterFullName: string;
  submitterRole: string;
  submitterNotes: string | null;
  docTypeLabel: string;
  docFilename: string;
  docStorageKey: string;
  submittedAt: Date;
}

export function TeamVerificationsTable({ rows }: { rows: TeamRowProps[] }) {
  const [pending, startTransition] = useTransition();
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function onApprove(id: string) {
    startTransition(async () => {
      const res = await approveTeamAction({ verificationId: id });
      if (!res.ok) toast.error(res.error);
      else
        toast.success(
          res.releasedCount > 0
            ? `Freigeschaltet. ${res.releasedCount} Rechnung${res.releasedCount === 1 ? "" : "en"} released.`
            : "Freigeschaltet."
        );
    });
  }

  function onReject(id: string) {
    if (reason.trim().length < 3) {
      toast.error("Bitte Begründung angeben.");
      return;
    }
    startTransition(async () => {
      const res = await rejectTeamAction({
        verificationId: id,
        reason: reason.trim()
      });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success("Abgelehnt.");
        setRejectFor(null);
        setReason("");
      }
    });
  }

  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li
          key={r.id}
          className="rounded-2xl border border-brand-neutral/40 bg-white p-5"
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="font-display font-black text-lg tracking-tight text-brand-night-navy">
                {r.teamName}{" "}
                <span className="text-sm font-normal text-brand-night-navy/60">
                  · {r.clubName} · Saison {r.teamSaison}
                </span>
              </div>
              <div className="text-xs text-brand-night-navy/60 mt-0.5">
                Eingereicht{" "}
                {r.submittedAt.toLocaleString("de-DE", {
                  dateStyle: "medium",
                  timeStyle: "short"
                })}
              </div>
              <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                <div>
                  <span className="text-brand-night-navy/50">Antragsteller:</span>{" "}
                  <strong>{r.submitterFullName}</strong>
                </div>
                <div>
                  <span className="text-brand-night-navy/50">Rolle:</span>{" "}
                  <strong>{r.submitterRole}</strong>
                </div>
                <div>
                  <span className="text-brand-night-navy/50">E-Mail:</span>{" "}
                  <span className="font-mono text-xs">{r.submitterEmail}</span>
                </div>
                <div>
                  <span className="text-brand-night-navy/50">Doc-Typ:</span>{" "}
                  <strong>{r.docTypeLabel}</strong>
                </div>
              </div>
              {r.submitterNotes && (
                <blockquote className="mt-3 border-l-2 border-accent/40 pl-3 text-xs text-brand-night-navy/70 italic">
                  „{r.submitterNotes}"
                </blockquote>
              )}
              <div className="mt-3">
                <a
                  href={`/api/admin/document?key=${encodeURIComponent(r.docStorageKey)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
                >
                  <Paperclip className="h-4 w-4 shrink-0" aria-hidden />
                  {r.docFilename}
                </a>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                size="sm"
                variant="accent"
                disabled={pending}
                onClick={() => onApprove(r.id)}
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
            <div className="mt-4 space-y-2">
              <Textarea
                placeholder="Begründung (wird dem Anfragenden gemailt)"
                maxLength={500}
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                size="sm"
                variant="destructive"
                disabled={pending || reason.trim().length < 3}
                onClick={() => onReject(r.id)}
              >
                Ablehnen bestätigen
              </Button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
