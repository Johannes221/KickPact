"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export interface ReminderPayload {
  subject: string;
  body: string;
  sponsorEmail: string;
}

/**
 * Zahlungserinnerungs-Vorlage (Phase 5 Paket C). KickPact versendet NICHTS
 * (User-Entscheid: keine Auto-Mahnungen) — der Verein bekommt einen fertigen,
 * freundlichen Text zum Kopieren bzw. öffnet ihn direkt im eigenen
 * Mail-Programm (mailto:). Text wird server-seitig aus
 * lib/invoicing/reminder-text.ts gebaut und hier nur angezeigt.
 */
export function ReminderDialog({ reminder }: { reminder: ReminderPayload }) {
  const [open, setOpen] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(reminder.body);
      toast.success("Text kopiert.");
    } catch {
      toast.error("Kopieren fehlgeschlagen — bitte Text manuell markieren.");
    }
  }

  const mailtoHref = `mailto:${encodeURIComponent(reminder.sponsorEmail)}?subject=${encodeURIComponent(reminder.subject)}&body=${encodeURIComponent(reminder.body)}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="text-xs">
          Erinnerung
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Zahlungserinnerung erstellen</DialogTitle>
          <DialogDescription>
            Fertiger Text für deinen Sponsor — kopieren oder direkt im
            Mail-Programm öffnen. KickPact versendet nichts automatisch.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-xs text-brand-night-navy/60">
            <span className="font-semibold text-brand-night-navy">Betreff:</span>{" "}
            {reminder.subject}
          </div>
          <Textarea
            readOnly
            value={reminder.body}
            rows={12}
            className="font-mono text-xs leading-relaxed"
            onFocus={(e) => e.currentTarget.select()}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
              Text kopieren
            </Button>
            <Button asChild size="sm" variant="accent">
              <a href={mailtoHref}>Im Mail-Programm öffnen</a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
