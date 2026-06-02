"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  sendSupportReplyAction,
  addInternalNoteAction
} from "@/app/admin/(panel)/support/_actions/actions";

export function SupportReplyForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSend() {
    if (body.trim().length === 0) return;
    setPending(true);
    const res = internal
      ? await addInternalNoteAction({ ticketId, body })
      : await sendSupportReplyAction({ ticketId, body });
    setPending(false);
    if (res.ok) {
      toast.success(internal ? "Interne Notiz gespeichert" : "Antwort gesendet");
      setBody("");
      router.refresh();
    } else {
      toast.error(res.error ?? "Senden fehlgeschlagen");
    }
  }

  return (
    <div className="space-y-3">
      <Textarea
        rows={5}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={
          internal
            ? "Interne Notiz (nur fürs Team sichtbar, wird NICHT gemailt)…"
            : "Antwort an den Absender (wird als E-Mail verschickt)…"
        }
        className={internal ? "border-amber-300 bg-amber-50/50" : undefined}
      />
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-brand-night-navy/70 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={internal}
            onChange={(e) => setInternal(e.target.checked)}
            className="h-4 w-4 rounded border-brand-neutral/50 accent-amber-500"
          />
          Interne Notiz (nicht an Kunde)
        </label>
        <Button
          variant={internal ? "outline" : "accent"}
          onClick={handleSend}
          disabled={pending || body.trim().length === 0}
        >
          {pending ? "Speichern…" : internal ? "Notiz speichern" : "Antwort senden"}
        </Button>
      </div>
    </div>
  );
}
