"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { toast } from "sonner";
import {
  editMatchEventAction,
  deleteMatchEventAction
} from "@/lib/actions/match-events-edit";

/**
 * Plan 3 Teil 2 — Inline Edit/Delete-Actions für ein Match-Event.
 *
 * Wird in `match-events-list.tsx` pro Event eingehängt, aber nur wenn der
 * User Trainer- oder Admin-Rolle im Club hat (Server-Page entscheidet das).
 */

const editSchema = z.object({
  minute: z.number().int().min(0).max(130),
  type: z.enum(["tor", "auswechslung", "spezial", "karte"]),
  subtype: z.string().optional(),
  playerName: z.string().max(60).optional()
});

type EditValues = z.infer<typeof editSchema>;

const SUBTYPE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  spezial: [
    { value: "kopfball", label: "Kopfballtor" },
    { value: "hackentor", label: "Hackentor" },
    { value: "volley", label: "Volley" },
    { value: "fernschuss", label: "Fernschuss" },
    { value: "elfmeter", label: "Elfmeter" },
    { value: "freistoss", label: "Freistoß" },
    { value: "assist", label: "Vorlage (Assist)" },
    { value: "man_of_match", label: "Spieler des Spiels" }
  ],
  karte: [
    { value: "gelb", label: "Gelbe Karte" },
    { value: "rot", label: "Rote Karte" }
  ],
  tor: [],
  auswechslung: []
};

export function EventRowActions({
  eventId,
  initial
}: {
  eventId: string;
  initial: {
    minute: number | null;
    type: "tor" | "auswechslung" | "spezial" | "karte";
    subtype: string | null;
    playerName: string | null;
  };
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      minute: initial.minute ?? 0,
      type: initial.type,
      subtype: initial.subtype ?? "",
      playerName: initial.playerName ?? ""
    }
  });
  const type = form.watch("type");

  function onEdit(values: EditValues) {
    startTransition(async () => {
      try {
        const res = await editMatchEventAction({
          matchEventId: eventId,
          minute: values.minute,
          type: values.type,
          subtype: values.subtype ? values.subtype : null,
          playerName: values.playerName ? values.playerName : null
        });
        const detail =
          res.invalidatedCharges > 0
            ? ` · ${res.invalidatedCharges} Charge(s) für Re-Eval zurückgesetzt`
            : "";
        toast.success(`Event aktualisiert${detail}`);
        setEditOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler beim Speichern");
      }
    });
  }

  function onDelete() {
    startTransition(async () => {
      try {
        const res = await deleteMatchEventAction({ matchEventId: eventId });
        const detail =
          res.invalidatedCharges > 0
            ? ` · ${res.invalidatedCharges} Charge(s) cancelled`
            : "";
        toast.success(`Event gelöscht${detail}`);
        setDeleteOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler beim Löschen");
      }
    });
  }

  const subtypeOptions = SUBTYPE_OPTIONS[type] ?? [];

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="text-[0.6rem] uppercase tracking-widest font-bold text-brand-night-navy/50 hover:text-accent px-1.5 py-0.5 rounded hover:bg-accent/10 transition-colors"
          aria-label="Event bearbeiten"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="text-[0.6rem] uppercase tracking-widest font-bold text-brand-night-navy/50 hover:text-brand-alert-red px-1.5 py-0.5 rounded hover:bg-brand-alert-red/10 transition-colors"
          aria-label="Event löschen"
        >
          Löschen
        </button>
      </div>

      {/* Edit-Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-black text-xl tracking-tight">
              Event bearbeiten
            </DialogTitle>
            <DialogDescription>
              Änderungen setzen alle Charges aus diesem Event zurück. Eine
              Neuauswertung läuft automatisch.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onEdit)} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="minute"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Minute</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          max="130"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Typ</FormLabel>
                      <Select
                        onValueChange={(v) => {
                          field.onChange(v);
                          form.setValue("subtype", "");
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="tor">⚽ Tor</SelectItem>
                          <SelectItem value="auswechslung">🔄 Wechsel</SelectItem>
                          <SelectItem value="spezial">🎭 Spezial</SelectItem>
                          <SelectItem value="karte">🟨 Karte</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {subtypeOptions.length > 0 && (
                <FormField
                  control={form.control}
                  name="subtype"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subtyp</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="– kein –" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {subtypeOptions.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="playerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Spieler</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="z.B. Schmidt" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditOpen(false)}
                  disabled={pending}
                >
                  Abbrechen
                </Button>
                <Button type="submit" variant="accent" disabled={pending}>
                  {pending ? "Speichere…" : "Speichern"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete-Confirm */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-black text-xl tracking-tight text-brand-alert-red">
              Event wirklich löschen?
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2">
              <span className="block">
                Das Event wird unwiderruflich entfernt. Alle daraus entstandenen
                Charges werden auf <strong>cancelled</strong> gesetzt.
              </span>
              <span className="block text-xs text-brand-night-navy/60">
                Bereits in Rechnung gestellte Charges können nicht gelöscht werden —
                in dem Fall bricht die Aktion ab.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteOpen(false)}
              disabled={pending}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onDelete}
              disabled={pending}
            >
              {pending ? "Lösche…" : "Endgültig löschen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
