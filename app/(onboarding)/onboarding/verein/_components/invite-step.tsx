"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { finalizeOnboarding } from "../_actions/finalize";
import { toast } from "sonner";

export function InviteStep() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [invitationUrl, setInvitationUrl] = useState<string>("");
  const [clubSlug, setClubSlug] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (invitationUrl || error) return;
    startTransition(async () => {
      try {
        const result = await finalizeOnboarding({
          verein: {
            name: params.get("name") ?? "",
            vereinId: params.get("vereinId") ?? "",
            slug: params.get("slug") ?? ""
          },
          team: {
            name: params.get("teamName") ?? "",
            teamId: params.get("teamId") ?? "",
            slug: params.get("teamSlug") ?? "",
            saison: params.get("saison") ?? ""
          },
          stammdaten: {
            contactName: params.get("contactName") ?? "",
            street: params.get("street") ?? "",
            zip: params.get("zip") ?? "",
            city: params.get("city") ?? "",
            isSmallBusiness: params.get("isSmallBusiness") === "true",
            taxId: params.get("taxId") || undefined,
            iban: params.get("iban") ?? ""
          },
          plan: (params.get("plan") as "basic" | "pro") ?? "basic"
        });
        const baseUrl = window.location.origin;
        setInvitationUrl(`${baseUrl}/einladung/${result.invitationToken}`);
        setClubSlug(result.clubSlug);
        toast.success("Verein angelegt 🎉");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Fehler beim Anlegen";
        setError(msg);
        toast.error(msg);
      }
    });
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
          <CardTitle className="font-display font-black text-3xl tracking-tight text-brand-night-navy">
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
