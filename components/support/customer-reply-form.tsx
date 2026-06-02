"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addCustomerReplyAction } from "@/lib/actions/support";

const SESSION_EXPIRED_MESSAGE = "SESSION_EXPIRED";

export function CustomerReplyForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (body.trim().length === 0) return;
    setPending(true);
    setError(null);
    const res = await addCustomerReplyAction({ ticketId, body });
    setPending(false);
    if (res.ok) {
      setBody("");
      router.refresh();
    } else if (res.error === SESSION_EXPIRED_MESSAGE) {
      window.location.reload();
    } else {
      setError(res.error ?? "Senden fehlgeschlagen");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <Textarea
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Antwort schreiben…"
        disabled={pending}
      />
      {error && <p className="text-sm text-brand-alert-red">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" variant="accent" size="sm" disabled={pending || body.trim().length === 0}>
          {pending ? "Senden…" : "Antwort senden"}
        </Button>
      </div>
    </form>
  );
}
