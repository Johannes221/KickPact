"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { Input } from "@/components/ui/input";
import { createInvitationAction, revokeInvitationAction } from "../_actions/invitations";
import { resendInvitationAction } from "../_actions/resend-invitation";
import { toast } from "sonner";
import { copyText } from "@/lib/platform/clipboard";

interface Team {
  id: string;
  name: string;
  /** false = relevante Entität (Mannschaft bzw. Verein) noch nicht verifiziert → Invite gesperrt. */
  canInvite: boolean;
  /** Verifikations-Scope: Einzel-Mannschaft (basic/pro) vs. Vereinslizenz. */
  verifyEntity: "Mannschaft" | "Verein";
  /** Ziel-URL für „… verifizieren". */
  verifyHref: string;
}

interface Invitation {
  id: string;
  token: string;
  status: string;
  createdAt: Date;
  teamId: string;
  teamName: string;
  recipientName: string | null;
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
  const [recipientName, setRecipientName] = useState("");

  // Sponsoren-Gate (Design 2026-05-29 §3.5/§6): Invite ist gesperrt, bis die
  // relevante Entität der gewählten Mannschaft verifiziert ist — bei Einzel-
  // Mannschaft die Mannschaft selbst, bei Vereinslizenz der Verein.
  const selected = teams.find((t) => t.id === selectedTeam);
  const canInvite = selected?.canInvite ?? false;
  const verifyEntity = selected?.verifyEntity ?? "Verein";
  const verifyHref =
    selected?.verifyHref ?? `/verein/${clubSlug}/verifikation`;
  const verifyAccusative =
    verifyEntity === "Mannschaft" ? "die Mannschaft" : "den Verein";
  const verifyNominative =
    verifyEntity === "Mannschaft" ? "die Mannschaft" : "der Verein";
  const verifyPlural =
    verifyEntity === "Mannschaft" ? "Mannschaften" : "Vereine";

  function createNew() {
    if (!selectedTeam) {
      toast.error("Bitte Mannschaft wählen");
      return;
    }
    if (!canInvite) {
      toast.error(`Bitte zuerst ${verifyAccusative} verifizieren.`);
      return;
    }
    startTransition(async () => {
      try {
        await createInvitationAction({
          clubSlug,
          teamId: selectedTeam,
          recipientName: recipientName.trim() || undefined
        });
        toast.success("Einladung erstellt");
        setRecipientName("");
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

  function resend(invId: string) {
    startTransition(async () => {
      const res = await resendInvitationAction({ clubSlug, invitationId: invId });
      if (!res.ok) toast.error(res.error ?? "Fehler beim Erneuern");
      else {
        toast.success("Einladung erneuert — neuer Link ist aktiv");
        router.refresh();
      }
    });
  }

  function copyLink(token: string) {
    const url = `${window.location.origin}/einladung/${token}`;
    void copyText(url);
    toast.success("Link kopiert");
  }

  return (
    <section>
      <h2 className="font-display font-bold text-2xl tracking-tight text-brand-night-navy">
        Einladungslinks
      </h2>
      <p className="mt-1 text-sm text-brand-night-navy/60">
        Jeder Link führt Sponsoren ins Onboarding. Pro Mannschaft so viele Links wie du willst.
      </p>

      <Card className="mt-5 border-brand-neutral/40">
        <CardHeader>
          <CardTitle className="text-base font-display font-bold tracking-tight">
            Neue Einladung erstellen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="block text-xs text-brand-night-navy/60 font-semibold mb-1">
                Für Mannschaft
              </span>
              <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                <SelectTrigger>
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
            <div>
              <span className="block text-xs text-brand-night-navy/60 font-semibold mb-1">
                Name des Sponsors{" "}
                <span className="font-normal opacity-60">— optional, für Willkommensgruß</span>
              </span>
              <Input
                placeholder='z.B. "Familie Müller" oder "Bäckerei Schreiber"'
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createNew()}
              />
            </div>
          </div>
          <p className="text-xs text-brand-night-navy/60">
            Schützt deine Sponsoren — kein Geld an unverifizierte {verifyPlural}.
          </p>
          {canInvite ? (
            <div className="flex justify-end">
              <Button variant="accent" onClick={createNew} disabled={pending}>
                {pending ? "…" : "+ Einladung erstellen"}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <Button asChild variant="accent">
                <Link href={verifyHref}>Erst {verifyEntity} verifizieren</Link>
              </Button>
              <span className="text-xs text-brand-night-navy/60">
                Sponsoren-Einladungen sind frei, sobald {verifyNominative}{" "}
                verifiziert ist.
              </span>
            </div>
          )}
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
                <div className="flex items-center gap-2 flex-wrap">
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
                  {i.recipientName && (
                    <span className="text-xs text-brand-night-navy/60 italic">
                      für {i.recipientName}
                    </span>
                  )}
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
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => resend(i.id)}
                      disabled={pending}
                    >
                      Erneut senden
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revoke(i.id)}
                      disabled={pending}
                      className="text-brand-alert-red hover:bg-brand-alert-red/5 hover:text-brand-alert-red"
                    >
                      Zurückziehen
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
