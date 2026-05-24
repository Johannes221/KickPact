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
import { changeRoleAction, revokeAction } from "../_actions/manage";

export type ClubRole = "admin" | "trainer" | "viewer";
export type TeamRole = "trainer" | "viewer";

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
  trainer: "Trainer",
  viewer: "Viewer"
};

export function MembersTable({
  clubSlug,
  currentUserId,
  clubAdminCount,
  clubMembers,
  teamMembers
}: {
  clubSlug: string;
  currentUserId: string;
  clubAdminCount: number;
  clubMembers: ClubMember[];
  teamMembers: TeamMember[];
}) {
  const [pending, startTransition] = useTransition();
  // Track which row is acting, so we can disable just that row's controls
  // while the transition is pending.
  const [activeRowKey, setActiveRowKey] = useState<string | null>(null);

  const isLastAdmin = clubAdminCount <= 1;

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
        // Guard the UI: if this row is the acting admin AND they are the last
        // admin, disable demote + revoke (server-side enforces the same rule).
        const selfDemoteBlocked = isSelf && m.role === "admin" && isLastAdmin;
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
                  <span className="ml-2 text-xs text-brand-night-navy/50">
                    (Du)
                  </span>
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
                    Du bist der letzte Admin — befördere zuerst eine andere
                    Person.
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
                  disabled={m.role === "trainer"}
                  onSelect={() => runChangeTeamRole(m, "trainer", rowKey)}
                >
                  Trainer
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={m.role === "viewer"}
                  onSelect={() => runChangeTeamRole(m, "viewer", rowKey)}
                >
                  Viewer
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-brand-alert-red focus:text-brand-alert-red"
                  onSelect={() => runRevokeTeam(m, rowKey)}
                >
                  Entfernen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        );
      })}
    </ul>
  );
}
