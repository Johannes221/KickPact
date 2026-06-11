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
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { addManualEvent } from "@/lib/actions/match-events";
import { SPECIAL_GOAL_SUBTYPES } from "@/lib/triggers/special-goals";
import { toast } from "sonner";

const formSchema = z.object({
  type: z.enum(["spezial", "karte", "tor"]),
  subtype: z.string().optional(),
  minute: z.number().int().min(0).max(130),
  side: z.enum(["heim", "gast"]),
  playerName: z.string().min(1, "Name fehlt").max(60).optional()
});

type FormValues = z.infer<typeof formSchema>;

// B3 (Audit 2026-06-11): aus der single source of truth gespiegelt — nur diese
// Subtypen können von Sponsor-Pacts gematcht werden (Server validiert identisch).
const SPEZIAL_SUBTYPES = SPECIAL_GOAL_SUBTYPES.map((s) => ({
  value: s.value,
  label: s.label
}));
const DEFAULT_SPEZIAL_SUBTYPE = SPEZIAL_SUBTYPES[0].value;

const KARTE_SUBTYPES = [
  { value: "gelb", label: "Gelbe Karte" },
  { value: "rot", label: "Rote Karte" }
];

export function ManualEventEditor({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      type: "spezial",
      subtype: DEFAULT_SPEZIAL_SUBTYPE,
      minute: 0,
      side: "heim",
      playerName: ""
    }
  });

  const type = form.watch("type");

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      try {
        const res = await addManualEvent({
          matchId,
          minute: values.minute,
          type: values.type,
          subtype: values.subtype || undefined,
          side: values.side,
          playerName: values.playerName || undefined
        });
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        const chargesInfo =
          res.charges > 0
            ? `· ${res.charges} Charge${res.charges === 1 ? "" : "s"} erzeugt`
            : "";
        const approvalsInfo =
          res.approvals > 0
            ? `· ${res.approvals} Sponsor-Approval${res.approvals === 1 ? "" : "s"} ausstehend`
            : "";
        toast.success(`Event gespeichert ${chargesInfo} ${approvalsInfo}`.trim());
        setOpen(false);
        form.reset();
        router.refresh();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Fehler beim Speichern";
        toast.error(msg);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent" size="lg">
          + Spezial-Event nachpflegen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display font-bold text-2xl tracking-tight">
            Manual Event
          </DialogTitle>
          <DialogDescription>
            Kopfballtor, Karte oder anderes Spezial-Event nachpflegen. Sponsoren mit
            passendem Pact müssen bestätigen.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-2">
            {/* Type */}
            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event-Typ</FormLabel>
                  <Select
                    onValueChange={(v) => {
                      field.onChange(v);
                      // Subtype-Default für neuen Type
                      if (v === "spezial") form.setValue("subtype", DEFAULT_SPEZIAL_SUBTYPE);
                      else if (v === "karte") form.setValue("subtype", "gelb");
                      else form.setValue("subtype", "");
                    }}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="spezial">🎭 Spezial (Kopfball, Hackentor, …)</SelectItem>
                      <SelectItem value="karte">🟨🟥 Karte</SelectItem>
                      <SelectItem value="tor">⚽ Reguläres Tor (falls vergessen)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Subtype (conditional) */}
            {(type === "spezial" || type === "karte") && (
              <FormField
                control={form.control}
                name="subtype"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Genauer Typ</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(type === "spezial" ? SPEZIAL_SUBTYPES : KARTE_SUBTYPES).map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Minute + Side */}
            <div className="grid grid-cols-2 gap-4">
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
                name="side"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Seite</FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="flex gap-3 pt-2"
                      >
                        <Label
                          htmlFor="side-heim"
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <RadioGroupItem value="heim" id="side-heim" />
                          <span>Heim</span>
                        </Label>
                        <Label
                          htmlFor="side-gast"
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <RadioGroupItem value="gast" id="side-gast" />
                          <span>Gast</span>
                        </Label>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Player */}
            <FormField
              control={form.control}
              name="playerName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Spieler-Name (optional)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="z.B. Schmidt" />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Falls Pledges spieler-spezifisch sind, wird das verwendet.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
                Abbrechen
              </Button>
              <Button type="submit" variant="accent" disabled={pending}>
                {pending ? "Speichere…" : "Event speichern"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
