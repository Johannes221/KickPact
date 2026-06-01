"use client";

import { useState, useTransition } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { resolveConflictAction } from "../_actions/resolve";

export interface ConflictRow {
  id: string;
  clubName: string;
  clubSlug: string;
  claimantEmail: string;
  requestedRole: "admin" | "trainer" | "viewer";
  message: string | null;
  conflictDocStorageKey: string | null;
  createdAt: Date;
  existingAdmin: {
    submitterEmail: string;
    submitterFullName: string;
    docStorageKey: string;
    docFilename: string;
  } | null;
}

export function ConflictsTable({ rows }: { rows: ConflictRow[] }) {
  const [pending, startTransition] = useTransition();
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function onResolve(
    id: string,
    decision: "claimant_wins" | "reject_claim"
  ) {
    startTransition(async () => {
      const res = await resolveConflictAction({
        requestId: id,
        decision,
        reason: reason.trim() || undefined
      });
      if (!res.ok) toast.error(res.error);
      else {
        toast.success(
          res.action === "takeover"
            ? "Account-Übernahme abgeschlossen."
            : "Konflikt-Anfrage abgelehnt."
        );
        setReasonFor(null);
        setReason("");
      }
    });
  }

  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <li
          key={r.id}
          className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5"
        >
          <div className="flex items-baseline justify-between gap-4 flex-wrap mb-4">
            <div>
              <div className="font-display font-black text-lg tracking-tight text-brand-night-navy">
                {r.clubName}
              </div>
              <div className="text-xs text-brand-night-navy/60">
                Eingereicht{" "}
                {r.createdAt.toLocaleString("de-DE", {
                  dateStyle: "medium",
                  timeStyle: "short"
                })}
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            {/* Existing admin (current owner) */}
            <div className="rounded-xl border border-brand-neutral/40 bg-white p-4">
              <div className="text-[0.65rem] uppercase tracking-widest font-semibold text-brand-night-navy/50 mb-2">
                Bestehender Admin
              </div>
              {r.existingAdmin ? (
                <>
                  <div className="font-semibold text-sm">{r.existingAdmin.submitterFullName}</div>
                  <div className="text-xs text-brand-night-navy/60 font-mono">{r.existingAdmin.submitterEmail}</div>
                  <a
                    href={`/api/admin/document?key=${encodeURIComponent(r.existingAdmin.docStorageKey)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
                  >
                    <Paperclip className="h-4 w-4 shrink-0" aria-hidden />
                    {r.existingAdmin.docFilename}
                  </a>
                </>
              ) : (
                <div className="text-xs text-brand-night-navy/60 italic">
                  Kein verifizierter Admin vorhanden (Verein ist noch unverifiziert).
                </div>
              )}
            </div>

            {/* Claimant */}
            <div className="rounded-xl border border-amber-300 bg-white p-4">
              <div className="text-[0.65rem] uppercase tracking-widest font-semibold text-amber-700 mb-2">
                Anfragender (Konflikt-Claim)
              </div>
              <div className="font-semibold text-sm font-mono">{r.claimantEmail}</div>
              <div className="text-xs text-brand-night-navy/60">
                Möchte <strong>{r.requestedRole}</strong>-Zugriff
              </div>
              {r.message && (
                <blockquote className="mt-2 border-l-2 border-amber-400 pl-3 text-xs italic text-brand-night-navy/70">
                  „{r.message}"
                </blockquote>
              )}
              {r.conflictDocStorageKey && (
                <a
                  href={`/api/admin/document?key=${encodeURIComponent(r.conflictDocStorageKey)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-accent hover:underline"
                >
                  <Paperclip className="mr-1 inline h-4 w-4 align-[-0.2em]" aria-hidden />
                  Konflikt-Bescheinigung
                </a>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {reasonFor === r.id && (
              <Textarea
                placeholder="Optional: Entscheidungsbegründung (intern + an Verlierer-Seite)"
                maxLength={500}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            )}
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="accent"
                disabled={pending}
                onClick={() => {
                  setReasonFor(r.id);
                  setTimeout(() => onResolve(r.id, "claimant_wins"), 0);
                }}
              >
                Anfragenden bestätigen (Account-Übernahme)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setReasonFor(r.id);
                  setTimeout(() => onResolve(r.id, "reject_claim"), 0);
                }}
              >
                Claim ablehnen
              </Button>
            </div>
            <p className="text-xs text-brand-night-navy/50">
              Bei Account-Übernahme: bestehende Memberships werden entfernt, bestehende Verifikationen revoked, clubs.verifiedAt zurückgesetzt. Der Anfragende wird neuer Admin und muss separat verifizieren.
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
