"use client";

import { useState, useTransition } from "react";
import { MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

export type ClubRole = "admin" | "trainer" | "viewer";
export type TeamRole = "admin" | "viewer";

type ActionResult = { ok: true } | { ok: false; error: string };

// Geteilte Action-Signatur (vgl. _actions/manage.ts). Beide Scopes (Club/Team)
// erfüllen sie, damit die Tabelle scope-agnostisch bleibt.
export type ChangeRoleInput =
  | { scope: "club"; clubSlug: string; targetUserId: string; newRole: ClubRole }
  | { scope: "team"; clubSlug: string; targetUserId: string; teamId: string; newRole: TeamRole };
export type RevokeInput =
  | { scope: "club"; clubSlug: string; targetUserId: string }
  | { scope: "team"; clubSlug: string; targetUserId: string; teamId: string };

export interface ClubMember {
  userId: string;
  email: string;
  role: ClubRole;
}

export interface TeamMember {
  userId: string;
  email: string;
  role: TeamRole;
  teamId: string;
  teamName: string;
}

const CLUB_ROLE_LABEL: Record<ClubRole, string> = {
  admin: "Admin",
  trainer: "Trainer",
  viewer: "Viewer"
};

const TEAM_ROLE_LABEL: Record<TeamRole, string> = {
  admin: "Mannschaftsadmin",
  viewer: "Viewer"
};

/**
 * Mitglieder-Tabelle, scope-agnostisch über injizierte Server-Actions.
 *
 * - Vereins-Seite: clubMembers + teamMembers, clubAdminCount für den
 *   Letzter-Club-Admin-Guard.
 * - Team-Seite: nur teamMembers (clubMembers = []), teamAdminCount für den
 *   Letzter-Team-Admin-Guard.
 */
export function MembersTable({
  clubSlug,
  currentUserId,
  clubMembers,
  teamMembers,
  clubAdminCount,
  teamAdminCount,
  changeRoleAction,
  revokeAction
}: {
  clubSlug: string;
  currentUserId: string;
  clubMembers: ClubMember[];
  teamMembers: TeamMember[];
  /** Wenn gesetzt: Letzter-Club-Admin-Guard für Self-Demote/Revoke. */
  clubAdminCount?: number;
  /** Wenn gesetzt: Letzter-Team-Admin-Guard (sole admin nicht demote/entfernbar). */
  teamAdminCount?: number;
  changeRoleAction: (input: ChangeRoleInput) => Promise<ActionResult>;
  revokeAction: (input: RevokeInput) => Promise<ActionResult>;
}) {
  const [pending, startTransition] = useTransition();
  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);

  const isLastClubAdmin = (clubAdminCount ?? 0) <= 1;
  const isLastTeamAdmin = (teamAdminCount ?? 0) <= 1;

  function runChangeClubRole(member: ClubMember, newRole: ClubRole, rowKey: string) {
    if (member.role === newRole) return;
    setActiveRowKey(rowKey);
    startTransition(async () => {
      const res = await changeRoleAction({
        scope: "club",
        clubSlug,
        targetUserId: member.userId,
        newRole
      });
      setActiveRowKey(null);
      if (!res.ok) toast.error(res.error);
      else toast.success(`Rolle geändert: ${CLUB_ROLE_LABEL[newRole]}`);
    });
  }

  function runRevokeClub(member: ClubMember, rowKey: string) {
    setActiveRowKey(rowKey);
    startTransition(async () => {
      const res = await revokeAction({
        scope: "club",
        clubSlug,
        targetUserId: member.userId
      });
      setActiveRowKey(null);
      if (!res.ok) toast.error(res.error);
      else toast.success("Zugriff entfernt");
    });
  }

  function runChangeTeamRole(member: TeamMember, newRole: TeamRole, rowKey: string) {
    if (member.role === newRole) return;
    setActiveRowKey(rowKey);
    startTransition(async () => {
      const res = await changeRoleAction({
        scope: "team",
        clubSlug,
        targetUserId: member.userId,
        teamId: member.teamId,
        newRole
      });
      setActiveRowKey(null);
      if (!res.ok) toast.error(res.error);
      else toast.success(`Rolle geändert: ${TEAM_ROLE_LABEL[newRole]}`);
    });
  }

  function runRevokeTeam(member: TeamMember, rowKey: string) {
    setActiveRowKey(rowKey);
    startTransition(async () => {
      const res = await revokeAction({
        scope: "team",
        clubSlug,
        targetUserId: member.userId,
        teamId: member.teamId
      });
      setActiveRowKey(null);
      if (!res.ok) toast.error(res.error);
      else toast.success("Zugriff entfernt");
    });
  }

  if (clubMembers.length === 0 && teamMembers.length === 0) {
    return <p className="text-sm text-brand-night-navy/60">Noch keine Mitglieder.</p>;
  }

  return (
    <ul className="space-y-2">
      {clubMembers.map((m) => {
        const rowKey = `c-${m.userId}`;
        const isSelf = m.userId === currentUserId;
        const selfDemoteBlocked = isSelf && m.role === "admin" && isLastClubAdmin;
        const rowDisabled = pending && activeRowKey === rowKey;
        return (
          <li
            key={rowKey}
            className="rounded-lg border border-brand-neutral/40 bg-white p-3 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm text-brand-night-navy truncate">
                {m.email}
                {isSelf && (
                  <span className="ml-2 text-xs text-brand-night-navy/50">(Du)</span>
                )}
              </span>
              <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest text-accent-dark">
                Verein · {CLUB_ROLE_LABEL[m.role]}
              </span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={rowDisabled}
                  aria-label={`Aktionen für ${m.email}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Rolle ändern</DropdownMenuLabel>
                <DropdownMenuItem
                  disabled={m.role === "admin"}
                  onSelect={() => runChangeClubRole(m, "admin", rowKey)}
                >
                  Admin
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={m.role === "trainer" || selfDemoteBlocked}
                  onSelect={() => runChangeClubRole(m, "trainer", rowKey)}
                >
                  Trainer
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={m.role === "viewer" || selfDemoteBlocked}
                  onSelect={() => runChangeClubRole(m, "viewer", rowKey)}
                >
                  Viewer
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-brand-alert-red focus:text-brand-alert-red"
                  disabled={selfDemoteBlocked}
                  onSelect={() => runRevokeClub(m, rowKey)}
                >
                  Entfernen
                </DropdownMenuItem>
                {selfDemoteBlocked && (
                  <p className="px-2 pt-1 pb-2 text-[0.7rem] text-brand-night-navy/50 leading-snug">
                    Du bist der letzte Admin — befördere zuerst eine andere Person.
                  </p>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        );
      })}
      {teamMembers.map((m) => {
        const rowKey = `t-${m.userId}-${m.teamId}`;
        const rowDisabled = pending && activeRowKey === rowKey;
        // Letzter-Team-Admin-Guard: der einzige verbleibende Mannschaftsadmin
        // kann nicht zum Viewer gemacht oder entfernt werden.
        const lastAdminBlocked = m.role === "admin" && isLastTeamAdmin;
        return (
          <li
            key={rowKey}
            className="rounded-lg border border-brand-neutral/40 bg-white p-3 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm text-brand-night-navy truncate">{m.email}</span>
              <span className="shrink-0 rounded-full bg-brand-neutral/30 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-widest text-brand-night-navy">
                {m.teamName} · {TEAM_ROLE_LABEL[m.role]}
              </span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={rowDisabled}
                  aria-label={`Aktionen für ${m.email} in ${m.teamName}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Rolle ändern</DropdownMenuLabel>
                <DropdownMenuItem
                  disabled={m.role === "admin"}
                  onSelect={() => runChangeTeamRole(m, "admin", rowKey)}
                >
                  Mannschaftsadmin
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={m.role === "viewer" || lastAdminBlocked}
                  onSelect={() => runChangeTeamRole(m, "viewer", rowKey)}
                >
                  Viewer
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-brand-alert-red focus:text-brand-alert-red"
                  disabled={lastAdminBlocked}
                  onSelect={() => runRevokeTeam(m, rowKey)}
                >
                  Entfernen
                </DropdownMenuItem>
                {lastAdminBlocked && (
                  <p className="px-2 pt-1 pb-2 text-[0.7rem] text-brand-night-navy/50 leading-snug">
                    Letzter Mannschaftsadmin — befördere zuerst eine andere Person.
                  </p>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        );
      })}
    </ul>
  );
}
