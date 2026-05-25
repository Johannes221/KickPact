"use client";

import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  renameTeam,
  uploadTeamLogoFromForm
} from "@/lib/actions/team-lifecycle";

interface Props {
  teamId: string;
  initialName: string;
  logoUrl: string | null;
}

const ALLOWED = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 1_000_000;

export function TeamStammdatenForm({ teamId, initialName, logoUrl }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [pendingName, startNameTransition] = useTransition();
  const [pendingLogo, startLogoTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleRename() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Name darf nicht leer sein.");
      return;
    }
    if (trimmed.length > 80) {
      toast.error("Name max. 80 Zeichen.");
      return;
    }
    if (trimmed === initialName) return;
    startNameTransition(async () => {
      try {
        await renameTeam({ teamId, newName: trimmed });
        toast.success("Name aktualisiert.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler beim Speichern.");
      }
    });
  }

  function uploadFile(file: File) {
    if (!ALLOWED.includes(file.type)) {
      toast.error("Nur PNG, JPEG oder WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Logo zu groß (max. 1 MB).");
      return;
    }
    const formData = new FormData();
    formData.append("teamId", teamId);
    formData.append("file", file);
    startLogoTransition(async () => {
      try {
        await uploadTeamLogoFromForm(formData);
        toast.success("Logo aktualisiert.");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload fehlgeschlagen.");
      }
    });
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    uploadFile(files[0]);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="team-name" className="text-sm font-semibold">
          Mannschafts-Name
        </Label>
        <div className="flex gap-2">
          <Input
            id="team-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={pendingName}
            maxLength={80}
            className="flex-1"
          />
          <Button
            onClick={handleRename}
            disabled={pendingName || name.trim() === initialName || !name.trim()}
            variant="accent"
          >
            {pendingName ? "Speichere…" : "Speichern"}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Logo</Label>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-lg border border-brand-neutral/40 bg-brand-off-white flex items-center justify-center overflow-hidden shrink-0">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoUrl}
                alt="Team-Logo"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs text-brand-night-navy/40">Kein Logo</span>
            )}
          </div>
          <div
            className={
              "flex-1 rounded-lg border-2 border-dashed p-4 text-center transition-colors cursor-pointer " +
              (dragOver
                ? "border-accent bg-accent/5"
                : "border-brand-neutral/40 hover:border-accent/40 hover:bg-brand-off-white/40")
            }
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFiles(e.dataTransfer.files);
            }}
          >
            <p className="text-sm font-semibold text-brand-night-navy">
              {pendingLogo ? "Lade hoch…" : "Logo hierhin ziehen oder klicken"}
            </p>
            <p className="mt-1 text-xs text-brand-night-navy/50">
              PNG, JPEG oder WebP · max. 1 MB
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={ALLOWED.join(",")}
            className="sr-only"
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>
      </div>
    </div>
  );
}
