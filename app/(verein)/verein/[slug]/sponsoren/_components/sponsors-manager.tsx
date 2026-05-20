"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { createInvitationAction, revokeInvitationAction } from "../_actions/invitations";
import { toast } from "sonner";

interface Team {
  id: string;
  name: string;
}

interface Invitation {
  id: string;
  token: string;
  status: string;
  createdAt: Date;
  teamId: string;
  teamName: string;
}

export function SponsorsManager({
  clubSlug,
  teams,
  invitations
}: {
  clubSlug: string;
  teams: Team[];
  invitations: Invitation[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedTeam, setSelectedTeam] = useState(teams[0]?.id ?? "");

  function createNew() {
    if (!selectedTeam) {
      toast.error("Bitte Mannschaft wählen");
      return;
    }
    startTransition(async () => {
      try {
        await createInvitationAction({ clubSlug, teamId: selectedTeam });
        toast.success("Einladung erstellt");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function revoke(invId: string) {
    if (!confirm("Einladung wirklich zurückziehen? Der Link wird ungültig.")) return;
    startTransition(async () => {
      try {
        await revokeInvitationAction({ clubSlug, invitationId: invId });
        toast.success("Einladung zurückgezogen");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/einladung/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link kopiert");
  }

  return (
    <section>
      <h2 className="font-display font-black text-2xl tracking-tight text-brand-night-navy">
        Einladungslinks
      </h2>
      <p className="mt-1 text-sm text-brand-night-navy/60">
        Jeder Link führt Sponsoren in das Onboarding. Pro Mannschaft so viele Links wie du willst.
      </p>

      <Card className="mt-5 border-brand-neutral/40">
        <CardHeader>
          <CardTitle className="text-base font-display font-black tracking-tight">
            Neue Einladung erstellen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-brand-night-navy/60 font-semibold">
                Für Mannschaft
              </label>
              <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="accent" onClick={createNew} disabled={pending}>
              {pending ? "…" : "+ Einladung"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {invitations.length === 0 ? (
        <p className="mt-5 text-sm text-brand-night-navy/60">Keine Einladungslinks erstellt.</p>
      ) : (
        <ul className="mt-5 space-y-2">
          {invitations.map((i) => (
            <li
              key={i.id}
              className="rounded-lg border border-brand-neutral/40 bg-white p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-widest font-bold text-brand-night-navy/50">
                    {i.teamName}
                  </span>
                  <span
                    className={
                      "text-[0.6rem] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded " +
                      (i.status === "pending"
                        ? "bg-accent/10 text-accent-dark"
                        : i.status === "used"
                          ? "bg-brand-neutral/40 text-brand-night-navy/60"
                          : "bg-brand-alert-red/10 text-brand-alert-red")
                    }
                  >
                    {i.status}
                  </span>
                </div>
                <div className="mt-1 font-mono text-xs text-brand-night-navy/70 truncate">
                  /einladung/{i.token}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyLink(i.token)}
                  disabled={i.status !== "pending" || pending}
                >
                  Kopieren
                </Button>
                {i.status === "pending" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => revoke(i.id)}
                    disabled={pending}
                    className="text-brand-alert-red hover:bg-brand-alert-red/5 hover:text-brand-alert-red"
                  >
                    Zurückziehen
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
