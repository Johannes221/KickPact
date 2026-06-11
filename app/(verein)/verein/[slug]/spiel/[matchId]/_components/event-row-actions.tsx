"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
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
import { SPECIAL_GOAL_SUBTYPES } from "@/lib/triggers/special-goals";

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
  // B3 (Audit 2026-06-11): aus lib/triggers/special-goals.ts gespiegelt (single
  // source of truth) — nur diese Subtypen können Sponsor-Pacts matchen.
  spezial: SPECIAL_GOAL_SUBTYPES.map((s) => ({ value: s.value, label: s.label })),
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
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        const detail =
          res.invalidatedCharges > 0
            ? ` · ${res.invalidatedCharges} Beitrag/Beiträge für Re-Eval zurückgesetzt`
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
            ? ` · ${res.invalidatedCharges} Beitrag/Beiträge storniert`
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
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="grid h-8 w-8 place-items-center rounded-md text-brand-night-navy/60 hover:text-accent hover:bg-accent/10 transition-colors"
          aria-label="Event bearbeiten"
          title="Bearbeiten"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="grid h-8 w-8 place-items-center rounded-md text-brand-night-navy/60 hover:text-brand-alert-red hover:bg-brand-alert-red/10 transition-colors"
          aria-label="Event löschen"
          title="Löschen"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Edit-Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-xl tracking-tight">
              Event bearbeiten
            </DialogTitle>
            <DialogDescription>
              Änderungen setzen alle Beiträge aus diesem Event zurück. Eine
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
            <DialogTitle className="font-display font-bold text-xl tracking-tight text-brand-alert-red">
              Event wirklich löschen?
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2">
              <span className="block">
                Das Event wird unwiderruflich entfernt. Alle daraus entstandenen
                Beiträge werden <strong>storniert</strong>.
              </span>
              <span className="block text-xs text-brand-night-navy/60">
                Bereits in Rechnung gestellte Beiträge können nicht gelöscht werden —
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
