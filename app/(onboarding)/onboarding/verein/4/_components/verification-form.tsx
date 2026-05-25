"use client";

import { useState, useTransition, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { submitVerificationAction } from "../_actions/submit-verification";

const DOC_TYPES: ReadonlyArray<{ value: string; label: string; hint: string }> = [
  {
    value: "vereinsregister_auszug",
    label: "Vereinsregister-Auszug",
    hint: "Aktueller Auszug (max. 12 Monate alt) vom Amtsgericht"
  },
  {
    value: "vorstands_beschluss",
    label: "Vorstandsbeschluss",
    hint: "Auf Vereinsbriefkopf, mit Unterschrift und ggf. Vereinsstempel"
  },
  {
    value: "vereinssatzung",
    label: "Vereinssatzung",
    hint: "Mit aktueller Vorstands-Liste, in der dein Name genannt wird"
  },
  {
    value: "mitgliederversammlung_protokoll",
    label: "MV-Protokoll",
    hint: "Letzte Mitgliederversammlung mit Vorstandswahl"
  },
  {
    value: "sonstiges",
    label: "Sonstiges",
    hint: "Andere Form des Vertretungsnachweises (Notiz an uns hinzufügen)"
  }
];

export function VerificationForm() {
  const params = useSearchParams();
  const clubSlug = params.get("slug") ?? "";

  const [pending, startTransition] = useTransition();
  const [docType, setDocType] = useState<string>("vereinsregister_auszug");
  const [submitterRole, setSubmitterRole] = useState("");
  const [submitterFullName, setSubmitterFullName] = useState("");
  const [submitterNotes, setSubmitterNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!fileInputRef.current?.files?.[0]) {
      toast.error("Bitte eine Datei hochladen.");
      return;
    }
    const fd = new FormData();
    fd.set("clubSlug", clubSlug);
    fd.set("submitterRole", submitterRole);
    fd.set("submitterFullName", submitterFullName);
    fd.set("docType", docType);
    if (submitterNotes.trim()) fd.set("submitterNotes", submitterNotes.trim());
    fd.set("docFile", fileInputRef.current.files[0]);

    startTransition(async () => {
      const res = await submitVerificationAction(fd);
      if (!res.ok) toast.error(res.error);
      // On success the action redirects → no client-side state update needed.
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-2">
        <Label htmlFor="submitterFullName">Dein voller Name</Label>
        <Input
          id="submitterFullName"
          name="submitterFullName"
          required
          value={submitterFullName}
          onChange={(e) => setSubmitterFullName(e.target.value)}
          placeholder="z.B. Max Mustermann"
        />
        <p className="text-xs text-brand-night-navy/50">
          Muss auf der Bescheinigung wiederzufinden sein.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="submitterRole">Deine Rolle im Verein</Label>
        <Input
          id="submitterRole"
          name="submitterRole"
          required
          value={submitterRole}
          onChange={(e) => setSubmitterRole(e.target.value)}
          placeholder="z.B. 1. Vorsitzender, Schatzmeister, Trainer mit Mandat"
        />
      </div>

      <div className="space-y-3">
        <Label>Welche Art von Nachweis?</Label>
        <RadioGroup value={docType} onValueChange={setDocType} className="grid gap-2">
          {DOC_TYPES.map((t) => (
            <Label
              key={t.value}
              htmlFor={`doc-${t.value}`}
              className={
                "flex items-start gap-3 rounded-lg border bg-white p-4 cursor-pointer transition-colors " +
                (docType === t.value
                  ? "border-accent bg-accent/5"
                  : "border-brand-neutral/40 hover:border-accent/40")
              }
            >
              <RadioGroupItem value={t.value} id={`doc-${t.value}`} className="mt-1" />
              <div>
                <div className="font-semibold text-sm text-brand-night-navy">{t.label}</div>
                <div className="text-xs text-brand-night-navy/60 mt-0.5">{t.hint}</div>
              </div>
            </Label>
          ))}
        </RadioGroup>
      </div>

      <div className="space-y-2">
        <Label htmlFor="docFile">Datei hochladen</Label>
        <Input
          id="docFile"
          name="docFile"
          type="file"
          ref={fileInputRef}
          required
          accept="application/pdf,image/jpeg,image/png,image/heic,image/heif"
        />
        <p className="text-xs text-brand-night-navy/50">
          PDF, JPEG, PNG oder HEIC. Maximal 10 MB.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="submitterNotes">Notiz (optional)</Label>
        <Textarea
          id="submitterNotes"
          name="submitterNotes"
          rows={3}
          maxLength={500}
          value={submitterNotes}
          onChange={(e) => setSubmitterNotes(e.target.value)}
          placeholder="z.B. bei Sondersituationen ein kurzer Kontext für unser Review-Team."
        />
      </div>

      <div className="rounded-lg bg-brand-off-white p-4 text-xs text-brand-night-navy/70">
        Wir prüfen die Bescheinigung manuell — innerhalb von 1–2 Werktagen meldet sich
        unser Team. Bis dahin kannst du Mannschaften konfigurieren und Sponsoren einladen,
        aber wir versenden keine Rechnungen.
      </div>

      <Button
        type="submit"
        variant="accent"
        disabled={pending || !clubSlug}
        className="w-full"
      >
        {pending ? "Sende hoch…" : "Bescheinigung absenden & weiter"}
      </Button>
    </form>
  );
}
