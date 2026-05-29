"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { sendSupportReplyAction } from "@/app/admin/(panel)/support/_actions/actions";

export function SupportReplyForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSend() {
    if (body.trim().length === 0) return;
    setPending(true);
    const res = await sendSupportReplyAction({ ticketId, body });
    setPending(false);
    if (res.ok) {
      toast.success("Antwort gesendet");
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
        placeholder="Antwort an den Absender (wird als E-Mail verschickt)…"
      />
      <Button variant="accent" onClick={handleSend} disabled={pending || body.trim().length === 0}>
        {pending ? "Senden..." : "Antwort senden"}
      </Button>
    </div>
  );
}
