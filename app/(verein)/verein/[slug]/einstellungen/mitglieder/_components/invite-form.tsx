"use client";

import { useState, useTransition } from "react";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { inviteTeamMemberAction } from "../_actions/invite";

export interface InviteFormTeam {
  id: string;
  name: string;
}

export function InviteForm({
  clubSlug,
  teams
}: {
  clubSlug: string;
  teams: InviteFormTeam[];
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"trainer" | "viewer">("trainer");
  // Scope-Wert: "club" = Vereins-weite Mitgliedschaft, sonst Team-Id
  const [scope, setScope] = useState<string>("club");
  const [pending, startTransition] = useTransition();
  const [lastInvite, setLastInvite] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("E-Mail eintragen, dann geht's weiter.");
      return;
    }
    startTransition(async () => {
      const res = await inviteTeamMemberAction({
        clubSlug,
        email: email.trim(),
        role,
        teamId: scope === "club" ? null : scope
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setLastInvite(res.inviteUrl);
      setEmail("");
      toast.success("Einladung erzeugt. Link an die Person schicken.");
    });
  }

  function copyLink() {
    if (!lastInvite) return;
    navigator.clipboard
      .writeText(lastInvite)
      .then(() => toast.success("Link in Zwischenablage kopiert."))
      .catch(() => toast.error("Konnte nicht kopieren — bitte manuell auswählen."));
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-brand-neutral/40 bg-white p-4 space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="invite-email" className="text-xs font-bold uppercase tracking-widest text-brand-night-navy/60">
            E-Mail
          </Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="trainer@example.de"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={pending}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-role" className="text-xs font-bold uppercase tracking-widest text-brand-night-navy/60">
            Rolle
          </Label>
          <Select value={role} onValueChange={(v) => setRole(v as "trainer" | "viewer")} disabled={pending}>
            <SelectTrigger id="invite-role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="trainer">Trainer — kann Spiele + Events pflegen</SelectItem>
              <SelectItem value="viewer">Viewer — sieht alles, ändert nichts</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="invite-scope" className="text-xs font-bold uppercase tracking-widest text-brand-night-navy/60">
          Zugriff
        </Label>
        <Select value={scope} onValueChange={setScope} disabled={pending}>
          <SelectTrigger id="invite-scope">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="club">Ganzer Verein</SelectItem>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                Nur Mannschaft: {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-brand-night-navy/55">
          Verein-weit = sieht alle Mannschaften. Mannschaft-spezifisch = nur diese eine.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-brand-night-navy/55">
          Wir generieren einen Einladungs-Link mit Ablauf nach 30 Tagen.
        </p>
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Einladung erzeugen
        </Button>
      </div>

      {lastInvite ? (
        <div className="mt-2 rounded-md border border-accent/40 bg-accent/5 p-3 text-xs space-y-2">
          <p className="font-semibold text-brand-night-navy">
            Einladungs-Link bereit — schick ihn an die Person:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-white px-2 py-1.5 text-[0.7rem] text-brand-night-navy">
              {lastInvite}
            </code>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={copyLink}
              aria-label="Link kopieren"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </form>
  );
}
