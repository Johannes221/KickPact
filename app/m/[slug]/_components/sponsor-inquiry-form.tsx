"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createPublicSponsorLead } from "@/lib/actions/team-public-profile";

export function SponsorInquiryForm({
  teamSlug,
  teamName
}: {
  teamSlug: string;
  teamName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) {
      toast.error("Bitte gib deinen Namen an.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Bitte gib eine gültige E-Mail an.");
      return;
    }
    startTransition(async () => {
      try {
        await createPublicSponsorLead({
          teamSlug,
          name: name.trim(),
          email: email.trim(),
          message: message.trim() || undefined
        });
        setDone(true);
        toast.success("Anfrage gesendet!");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Senden fehlgeschlagen."
        );
      }
    });
  }

  if (done) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <strong>Danke!</strong> Deine Anfrage ist bei {teamName} eingegangen. Die
        Mannschaft meldet sich per E-Mail bei dir.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="lead-name" className="text-sm font-semibold">
            Dein Name
          </Label>
          <Input
            id="lead-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Max Mustermann"
            maxLength={100}
            disabled={pending}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lead-email" className="text-sm font-semibold">
            Deine E-Mail
          </Label>
          <Input
            id="lead-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="max@firma.de"
            maxLength={200}
            disabled={pending}
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="lead-message" className="text-sm font-semibold">
          Nachricht <span className="font-normal text-brand-night-navy/40">(optional)</span>
        </Label>
        <Textarea
          id="lead-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Worauf hast du Lust? Z. B. 5 € pro Tor – oder einfach eine kurze Vorstellung."
          rows={3}
          maxLength={1000}
          disabled={pending}
        />
      </div>
      <Button type="submit" variant="accent" disabled={pending} className="w-full sm:w-auto">
        {pending ? "Sende…" : "Anfrage senden"}
      </Button>
      <p className="text-xs text-brand-night-navy/45">
        Mit dem Absenden stimmst du zu, dass {teamName} deine Kontaktdaten zur
        Beantwortung deiner Anfrage verwendet.
      </p>
    </form>
  );
}
