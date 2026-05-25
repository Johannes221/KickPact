"use client";

import { useState, useTransition, useRef, type DragEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { submitVerificationAction } from "../_actions/submit-verification";
import { Upload, FileText, Image as ImageIcon, X } from "lucide-react";

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

// Was der `accept`-Attribut sagt: PDF + alle gängigen Bild-MIMEs. Auf iOS löst
// `accept="image/*"` automatisch den Kamera/Foto-Picker aus — wir lassen also
// bewusst `image/*` zu, plus PDF als File-Picker-Option.
const ACCEPT_ATTR = "application/pdf,image/jpeg,image/png,image/heic,image/heif,image/*";
const MAX_BYTES = 10 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function VerificationForm() {
  const params = useSearchParams();
  const clubSlug = params.get("slug") ?? "";
  const invitationToken = params.get("token") ?? "";

  const [pending, startTransition] = useTransition();
  const [docType, setDocType] = useState<string>("vereinsregister_auszug");
  const [submitterRole, setSubmitterRole] = useState("");
  const [submitterFullName, setSubmitterFullName] = useState("");
  const [submitterNotes, setSubmitterNotes] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFile(f: File | null | undefined) {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      toast.error(`Datei zu groß (${formatSize(f.size)}). Maximal 10 MB.`);
      return;
    }
    setSelectedFile(f);
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    handleFile(e.target.files?.[0]);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  function clearFile() {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedFile) {
      toast.error("Bitte eine Datei hochladen.");
      return;
    }
    if (!clubSlug) {
      toast.error("Onboarding-Daten fehlen. Bitte beginne neu.");
      return;
    }
    const fd = new FormData();
    fd.set("clubSlug", clubSlug);
    fd.set("invitationToken", invitationToken);
    fd.set("submitterRole", submitterRole);
    fd.set("submitterFullName", submitterFullName);
    fd.set("docType", docType);
    if (submitterNotes.trim()) fd.set("submitterNotes", submitterNotes.trim());
    fd.set("docFile", selectedFile);

    startTransition(async () => {
      try {
        const res = await submitVerificationAction(fd);
        if (!res.ok) toast.error(res.error);
        // Bei Erfolg redirected die Server-Action → kein State-Update nötig.
      } catch (err) {
        // Bei Server-Action-Redirect wirft Next.js eine spezielle Exception, die
        // intern verarbeitet wird — die fangen wir hier NICHT ab, damit der
        // Redirect funktioniert. Echte Fehler werden geloggt.
        const e = err as { digest?: string };
        if (e?.digest?.startsWith("NEXT_REDIRECT")) throw err;
        console.error("Verification submit failed", err);
        toast.error("Unerwarteter Fehler beim Hochladen. Bitte erneut versuchen.");
      }
    });
  }

  const isImage = selectedFile?.type.startsWith("image/");

  return (
    <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
      <div className="space-y-2">
        <Label htmlFor="submitterFullName">Dein voller Name</Label>
        <Input
          id="submitterFullName"
          name="submitterFullName"
          required
          value={submitterFullName}
          onChange={(e) => setSubmitterFullName(e.target.value)}
          placeholder="z.B. Max Mustermann"
          className="min-h-12"
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
          className="min-h-12"
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
        {!selectedFile ? (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={
              "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-white px-4 py-10 md:py-14 cursor-pointer transition-colors text-center " +
              (dragActive
                ? "border-accent bg-accent/5"
                : "border-brand-neutral/40 hover:border-accent/60 hover:bg-accent/[0.02]")
            }
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10">
              <Upload className="h-6 w-6 text-accent-dark" aria-hidden />
            </div>
            <div>
              <div className="font-semibold text-brand-night-navy">
                Datei hier ablegen
              </div>
              <div className="text-sm text-brand-night-navy/60 mt-1">
                oder <span className="text-accent-dark underline">durchsuchen</span>
                <span className="hidden sm:inline"> · auf dem Handy: Foto aufnehmen</span>
              </div>
            </div>
            <div className="text-xs text-brand-night-navy/50">
              PDF, JPEG, PNG oder HEIC · Maximal 10 MB
            </div>
            <input
              id="docFile"
              name="docFile"
              type="file"
              ref={fileInputRef}
              required
              accept={ACCEPT_ATTR}
              onChange={onPick}
              className="sr-only"
            />
          </div>
        ) : (
          <div className="rounded-xl border-2 border-accent bg-accent/5 p-4 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white">
              {isImage ? (
                <ImageIcon className="h-6 w-6 text-accent-dark" aria-hidden />
              ) : (
                <FileText className="h-6 w-6 text-accent-dark" aria-hidden />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm text-brand-night-navy truncate">
                {selectedFile.name}
              </div>
              <div className="text-xs text-brand-night-navy/60">
                {formatSize(selectedFile.size)} · ausgewählt
              </div>
            </div>
            <button
              type="button"
              onClick={clearFile}
              className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-lg text-brand-night-navy/60 hover:text-brand-night-navy hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Datei entfernen"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        )}
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
        disabled={pending || !clubSlug || !selectedFile}
        className="w-full min-h-12"
      >
        {pending ? "Sende hoch…" : "Bescheinigung absenden & weiter"}
      </Button>
    </form>
  );
}
