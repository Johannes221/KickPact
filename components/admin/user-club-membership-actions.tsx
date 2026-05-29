"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  setClubRoleAction,
  removeClubMembershipAction
} from "@/app/admin/(panel)/users/_actions/actions";

type ClubRole = "admin" | "trainer" | "viewer";

export function UserClubMembershipActions({
  userId,
  clubId,
  currentRole
}: {
  userId: string;
  clubId: string;
  currentRole: ClubRole;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function changeRole(role: ClubRole) {
    if (role === currentRole || pending) return;
    setPending(true);
    const res = await setClubRoleAction({ userId, clubId, role });
    setPending(false);
    if (res.ok) {
      toast.success(`Rolle → ${role}`);
      router.refresh();
    } else {
      toast.error(res.error ?? "Fehlgeschlagen");
    }
  }

  async function remove() {
    if (!window.confirm("Diese Club-Membership entfernen?")) return;
    setPending(true);
    const res = await removeClubMembershipAction({ userId, clubId });
    setPending(false);
    if (res.ok) {
      toast.success("Membership entfernt");
      router.refresh();
    } else {
      toast.error(res.error ?? "Fehlgeschlagen");
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={currentRole}
        disabled={pending}
        onChange={(e) => changeRole(e.target.value as ClubRole)}
        className="rounded-md border border-input bg-background px-2 py-1 text-xs"
      >
        <option value="admin">admin</option>
        <option value="trainer">trainer</option>
        <option value="viewer">viewer</option>
      </select>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="text-xs font-semibold text-rose-700 hover:underline"
      >
        Entfernen
      </button>
    </div>
  );
}
