"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { track } from "@/lib/analytics/track";

export function InviteStep() {
  const router = useRouter();
  const params = useSearchParams();
  const [invitationUrl, setInvitationUrl] = useState<string>("");
  const [clubSlug, setClubSlug] = useState<string>("");
  const [error, setError] = useState<string>("");
  // BUG-FIX 2026-05-25: finalizeOnboarding läuft jetzt schon in Step 3 (StammdatenStep).
  // Step 5 liest nur noch slug + token aus der URL — kein zweiter DB-Call mehr.
  // Fallback: wenn slug/token fehlen, sind wir auf einem Refresh ohne Daten →
  // zurück zu Step 1 schicken.
  const pending = false;

  useEffect(() => {
    if (invitationUrl || error) return;
    const slug = params.get("slug");
    const token = params.get("token");
    if (!slug || !token) {
      setError("Onboarding-Daten verloren. Bitte beginne neu.");
      return;
    }
    setClubSlug(slug);
    const baseUrl = window.location.origin;
    setInvitationUrl(`${baseUrl}/einladung/${token}`);
    track("verein_onboarding_completed", {
      plan: params.get("plan") ?? "basic",
      cycle: params.get("cycle") ?? "monthly"
    });
    toast.success("Verein angelegt 🎉");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <div className="rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-4 text-sm text-brand-alert-red">
        <strong>Fehler beim Anlegen:</strong> {error}
        <br />
        <Button
          variant="ghost"
          onClick={() => router.push("/onboarding/verein/3")}
          className="mt-2"
        >
          ← Zurück zu Stammdaten
        </Button>
      </div>
    );
  }

  if (pending && !invitationUrl) {
    return (
      <div className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-6 text-brand-night-navy/70 animate-pulse">
        Lege Verein an in der Datenbank…
      </div>
    );
  }

  if (!invitationUrl) {
    return <div className="text-brand-night-navy/60">Lade…</div>;
  }

  return (
    <div className="space-y-6">
      <Card className="border-accent/40 bg-accent/5">
        <CardHeader>
          <CardTitle className="font-display font-black text-2xl md:text-3xl tracking-tight text-brand-night-navy">
            🎉 Geschafft!
          </CardTitle>
          <p className="text-brand-night-navy/70">
            Dein Verein ist angelegt. Jetzt lädst du Sponsoren ein.
          </p>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-brand-night-navy/70">
            Schick diesen Link an Familie, Freunde, Stammtisch, lokale Unternehmen:
          </p>
          <div className="mt-3 flex flex-col gap-2 md:flex-row">
            <input
              readOnly
              value={invitationUrl}
              className="flex-1 rounded-md border border-brand-neutral/40 bg-white px-3 py-2 font-mono text-sm text-brand-night-navy"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              variant="accent"
              onClick={() => {
                navigator.clipboard.writeText(invitationUrl);
                toast.success("Link kopiert");
              }}
            >
              Kopieren
            </Button>
          </div>
          <p className="mt-3 text-xs text-brand-night-navy/50">
            Jeder, der diesen Link öffnet, kann sich als Sponsor für deine Mannschaft
            registrieren und Pledges anlegen.
          </p>
        </CardContent>
      </Card>

      <Button variant="outline" size="lg" onClick={() => router.push(`/verein/${clubSlug}`)}>
        Zum Vereins-Dashboard →
      </Button>
    </div>
  );
}
