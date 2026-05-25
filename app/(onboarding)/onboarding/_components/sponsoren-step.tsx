"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { track } from "@/lib/analytics/track";
import { completeOnboarding } from "../_actions/complete-onboarding";

interface TeamInvite {
  teamId: string;
  teamName: string;
  invitationToken: string;
}

interface Props {
  clubId: string;
  clubSlug: string;
  role: "mannschaft" | "verein";
  baseUrl: string;
  teams: TeamInvite[];
}

export function SponsorenStep({ clubId, clubSlug, role, baseUrl, teams }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function copyLink(token: string) {
    const url = `${baseUrl}/einladung/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link kopiert");
  }

  function finish() {
    startTransition(async () => {
      try {
        const result = await completeOnboarding({ clubId });
        track("verein_onboarding_completed", { role });
        if (role === "mannschaft" && teams[0]) {
          router.push(`/verein/${result.clubSlug}/mannschaft/${teams[0].teamId}`);
        } else {
          router.push(`/verein/${result.clubSlug}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Konnte Onboarding nicht abschließen.";
        toast.error(msg);
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-accent/40 bg-accent/5">
        <CardHeader>
          <CardTitle className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
            🎉 Fast geschafft!
          </CardTitle>
          <p className="text-brand-night-navy/70">
            {role === "mannschaft"
              ? "Deine Mannschaft ist angelegt. Jetzt brauchst du Sponsoren — schick diesen Link an Stammtisch, Familie, lokale Unternehmen."
              : "Dein Verein ist angelegt. Schick die Einladungs-Links pro Mannschaft an die jeweiligen Sponsoren."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {teams.map((t) => {
            const url = `${baseUrl}/einladung/${t.invitationToken}`;
            return (
              <div
                key={t.teamId}
                className="rounded-lg border border-brand-neutral/40 bg-white p-4"
              >
                <div className="text-xs uppercase tracking-widest font-semibold text-brand-night-navy/50 mb-1">
                  {t.teamName}
                </div>
                <div className="flex flex-col gap-2 md:flex-row">
                  <input
                    readOnly
                    value={url}
                    className="flex-1 rounded-md border border-brand-neutral/40 bg-brand-off-white px-3 py-2 font-mono text-xs text-brand-night-navy"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button variant="accent" onClick={() => copyLink(t.invitationToken)}>
                    Kopieren
                  </Button>
                </div>
              </div>
            );
          })}
          <p className="text-xs text-brand-night-navy/50">
            Du kannst die Links jederzeit über dein Dashboard erneut abrufen. Sponsoren
            registrieren sich über den Link und legen Pledges selbst fest (z.B. „5 € pro
            Tor").
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="accent" size="lg" onClick={finish} disabled={pending}>
          {pending
            ? "Schließe ab…"
            : role === "mannschaft"
              ? "Zum Mannschafts-Dashboard →"
              : "Zum Vereins-Dashboard →"}
        </Button>
      </div>

      <p className="text-center text-xs text-brand-night-navy/50">
        Du startest direkt in 30 Tagen{" "}
        {role === "mannschaft" ? "Pro-Trial" : "Vereinslizenz-Trial"} — keine Kreditkarte
        nötig. Wir erinnern dich rechtzeitig per E-Mail vor Trial-Ende.
      </p>
    </div>
  );
}
