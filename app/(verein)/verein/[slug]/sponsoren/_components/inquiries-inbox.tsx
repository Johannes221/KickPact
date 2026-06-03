"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { respondToInquiry } from "@/lib/actions/sponsor-inquiries";

interface Inquiry {
  id: string;
  teamId: string;
  teamName: string;
  status: string;
  message: string | null;
  createdAt: Date;
  sponsorEmail: string;
  sponsorName: string | null;
}

export function InquiriesInbox({ inquiries }: { inquiries: Inquiry[] }) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-display font-bold text-xl md:text-2xl tracking-tight text-brand-night-navy">
          Sponsor-Anfragen
        </h2>
        <span className="inline-flex items-center rounded-full bg-accent/15 text-accent-dark px-2.5 py-1 text-xs font-bold">
          {inquiries.length} offen
        </span>
      </div>
      <p className="mt-1 text-sm text-brand-night-navy/60">
        Sponsoren, die euch über die öffentliche KickPact-Suche gefunden haben.
      </p>
      <ul className="mt-3 md:mt-4 space-y-3">
        {inquiries.map((inq) => (
          <InquiryRow key={inq.id} inquiry={inq} />
        ))}
      </ul>
    </section>
  );
}

function InquiryRow({ inquiry }: { inquiry: Inquiry }) {
  const [response, setResponse] = useState("");
  const [mode, setMode] = useState<"closed" | "accept" | "reject">("closed");
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState<"accepted" | "rejected" | null>(null);

  async function handleSubmit(accept: boolean) {
    startTransition(async () => {
      try {
        await respondToInquiry({
          inquiryId: inquiry.id,
          accept,
          responseMessage: response.trim() || undefined
        });
        setDone(accept ? "accepted" : "rejected");
        toast.success(
          accept ? "Anfrage angenommen — Einladung verschickt." : "Anfrage abgelehnt."
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler");
      }
    });
  }

  if (done) {
    return (
      <li className="rounded-xl border border-brand-neutral/40 bg-brand-off-white p-4 text-sm text-brand-night-navy/70">
        {done === "accepted" ? "✓ Angenommen, Einladung gesendet." : "Anfrage abgelehnt."}
      </li>
    );
  }

  return (
    <li className="rounded-xl bg-white shadow-ios-card p-4 md:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest text-accent-dark font-bold">
            {inquiry.teamName}
          </div>
          <div className="mt-1 font-semibold text-sm md:text-base text-brand-night-navy">
            {inquiry.sponsorName ?? inquiry.sponsorEmail}
          </div>
          {inquiry.sponsorName && (
            <div className="text-xs text-brand-night-navy/50">{inquiry.sponsorEmail}</div>
          )}
        </div>
        <div className="text-[0.65rem] text-brand-night-navy/40">
          {new Date(inquiry.createdAt).toLocaleDateString("de-DE")}
        </div>
      </div>
      {inquiry.message && (
        <blockquote className="mt-3 rounded bg-brand-off-white p-3 text-xs md:text-sm text-brand-night-navy/80 italic">
          „{inquiry.message}"
        </blockquote>
      )}

      {mode === "closed" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="accent" onClick={() => setMode("accept")}>
            Annehmen
          </Button>
          <Button size="sm" variant="outline" onClick={() => setMode("reject")}>
            Ablehnen
          </Button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder={
              mode === "accept"
                ? "Optional: Begrüßung an den Sponsor"
                : "Optional: Begründung (z.B. 'Schon voll')"
            }
            rows={2}
            maxLength={500}
            className="w-full rounded-lg bg-white shadow-ios-card px-3 py-2 text-sm text-brand-night-navy focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={mode === "accept" ? "accent" : "outline"}
              disabled={isPending}
              onClick={() => handleSubmit(mode === "accept")}
            >
              {isPending ? "Sende…" : mode === "accept" ? "Annehmen & einladen" : "Ablehnen senden"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("closed")}>
              Zurück
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
