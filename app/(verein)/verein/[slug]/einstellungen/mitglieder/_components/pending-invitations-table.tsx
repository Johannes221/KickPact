"use client";

import { useState, useTransition, useEffect } from "react";
import { Copy, RefreshCw, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { copyText } from "@/lib/platform/clipboard";
import { Button } from "@/components/ui/button";

type ActionResult = { ok: true } | { ok: false; error: string };
type RefreshResult = { ok: true; inviteUrl: string } | { ok: false; error: string };

export interface PendingInvitationRow {
  id: string;
  token: string;
  recipientEmail: string | null;
  role: "admin" | "trainer" | "viewer";
  teamId: string | null;
  teamName: string | null;
  createdAt: Date;
  expiresAt: Date;
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Mannschaftsadmin",
  trainer: "Trainer",
  viewer: "Viewer"
};

function daysLeft(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
}

export function PendingInvitationsTable({
  clubSlug,
  rows,
  baseUrl,
  revokeAction,
  refreshAction,
  showTeamColumn = true
}: {
  clubSlug: string;
  rows: PendingInvitationRow[];
  baseUrl: string;
  revokeAction: (input: { clubSlug: string; invitationId: string }) => Promise<ActionResult>;
  refreshAction: (input: { clubSlug: string; invitationId: string }) => Promise<RefreshResult>;
  /** Team-Seite: false, da alle Invites dieselbe Mannschaft betreffen. */
  showTeamColumn?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  // #418-Guard: Date.now()-basierte Restzeit erst nach dem Mount rendern.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Tracks which invitation is being acted on
  const [activeId, setActiveId] = useState<string | null>(null);
  // After refresh: store new URL per id
  const [refreshedUrls, setRefreshedUrls] = useState<Record<string, string>>({});

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-brand-neutral/40 bg-brand-off-white p-5 text-center text-sm text-brand-night-navy/60">
        Keine offenen Einladungen.
      </div>
    );
  }

  function inviteUrl(token: string) {
    return `${baseUrl}/team-einladung/${token}`;
  }

  function copyUrl(url: string) {
    copyText(url)
      .then(() => toast.success("Link kopiert."))
      .catch(() => toast.error("Kopieren fehlgeschlagen — bitte manuell auswählen."));
  }

  function handleRevoke(id: string) {
    setActiveId(id);
    startTransition(async () => {
      const res = await revokeAction({ clubSlug, invitationId: id });
      setActiveId(null);
      if (!res.ok) {
        toast.error(res.error);
      } else {
        toast.success("Einladung widerrufen.");
      }
    });
  }

  function handleRefresh(id: string) {
    setActiveId(id);
    startTransition(async () => {
      const res = await refreshAction({ clubSlug, invitationId: id });
      setActiveId(null);
      if (!res.ok) {
        toast.error(res.error);
      } else {
        setRefreshedUrls((prev) => ({ ...prev, [id]: res.inviteUrl }));
        copyUrl(res.inviteUrl);
        toast.success("Link erneuert (30 Tage) + kopiert.");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-brand-neutral/40 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-brand-off-white border-b border-brand-neutral/40">
          <tr>
            <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-brand-night-navy/60">
              E-Mail / Empfänger
            </th>
            <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-brand-night-navy/60">
              Rolle
            </th>
            {showTeamColumn && (
              <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-brand-night-navy/60 hidden sm:table-cell">
                Zugriff
              </th>
            )}
            <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-widest text-brand-night-navy/60 hidden md:table-cell">
              Läuft ab
            </th>
            <th className="px-4 py-2.5 text-right" />
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-neutral/20 bg-white">
          {rows.map((row) => {
            const currentUrl = refreshedUrls[row.id] ?? inviteUrl(row.token);
            const isLoading = pending && activeId === row.id;
            const days = mounted ? daysLeft(new Date(row.expiresAt)) : null;

            return (
              <tr key={row.id} className="hover:bg-brand-off-white/60 transition-colors">
                <td className="px-4 py-3 max-w-[160px]">
                  <span className="truncate block text-brand-night-navy">
                    {row.recipientEmail ?? (
                      <span className="text-brand-night-navy/40 italic">kein Name</span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                    row.role === "viewer"
                      ? "bg-brand-neutral/20 text-brand-night-navy/70"
                      : "bg-accent/10 text-accent"
                  }`}>
                    {ROLE_LABEL[row.role] ?? row.role}
                  </span>
                </td>
                {showTeamColumn && (
                  <td className="px-4 py-3 text-brand-night-navy/70 hidden sm:table-cell">
                    {row.teamName ?? "Ganzer Verein"}
                  </td>
                )}
                <td className="px-4 py-3 hidden md:table-cell">
                  <span className={`text-xs ${days !== null && days <= 3 ? "text-red-600 font-semibold" : "text-brand-night-navy/60"}`}>
                    {days === null ? "…" : days === 0 ? "Heute" : `${days}d`}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    {/* Copy current link */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyUrl(currentUrl)}
                      disabled={isLoading}
                      title="Link kopieren"
                      className="h-7 w-7 p-0"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    {/* Refresh: revoke + new token */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRefresh(row.id)}
                      disabled={isLoading}
                      title="Link erneuern (30 neue Tage)"
                      className="h-7 w-7 p-0"
                    >
                      {isLoading && activeId === row.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    {/* Revoke */}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRevoke(row.id)}
                      disabled={isLoading}
                      title="Einladung widerrufen"
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
