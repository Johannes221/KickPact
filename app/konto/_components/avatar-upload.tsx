"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Profilbild-Upload (Mein Konto). POST an /api/user/avatar (Route-Handler,
 * kein 1-MB-Limit; HEIC→JPEG serverseitig). Zeigt das aktuelle Bild bzw. fällt
 * auf Initialen zurück. Das Bild erscheint danach überall im Avatar (Header).
 *
 * `image` = users.image aus der DB: ohne Wert wird gar kein <img> gerendert
 * (kein Leer-Request an die Route), externe OAuth-URLs werden direkt geladen.
 */
export function AvatarUpload({
  initials,
  image
}: {
  initials: string;
  image: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0); // Cache-Bust nach Upload

  // Nach einem frischen Upload liegt das Bild immer als Storage-Key vor →
  // Route-Handler mit Cache-Bust. Vorher: externe URL direkt, Key via Route.
  const src =
    version > 0
      ? `/api/user/avatar?v=${version}`
      : image
        ? /^https?:\/\//.test(image)
          ? image
          : "/api/user/avatar"
        : null;

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/user/avatar", {
        method: "POST",
        body: fd,
        credentials: "include"
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Upload fehlgeschlagen.");
      toast.success("Profilbild aktualisiert.");
      setVersion((n) => n + 1);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-16 w-16">
        {src && <AvatarImage src={src} alt="" />}
        <AvatarFallback className="bg-accent text-white text-base font-bold">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPick}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Lädt…" : "Profilbild ändern"}
        </Button>
        <p className="mt-1.5 text-xs text-brand-night-navy/50">
          JPG, PNG oder HEIC. Erscheint überall als dein Profilbild.
        </p>
      </div>
    </div>
  );
}
