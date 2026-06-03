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
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { toast } from "sonner";
import { overrideMatchResultAction } from "@/lib/actions/match-events-edit";

/**
 * Plan 3 Teil 2 — Admin-only Form um das Match-Ergebnis manuell zu
 * überschreiben. Cancelt non-invoiced Charges und feuert Re-Eval.
 */

const formSchema = z.object({
  ergebnisHeim: z.number().int().min(0).max(30),
  ergebnisGast: z.number().int().min(0).max(30),
  halbzeitHeim: z.number().int().min(0).max(30).nullable().optional(),
  halbzeitGast: z.number().int().min(0).max(30).nullable().optional(),
  reason: z
    .string()
    .min(3, "Bitte begründe den Eingriff (mind. 3 Zeichen).")
    .max(300)
});

type FormValues = z.infer<typeof formSchema>;

export function ResultOverrideEditor({
  matchId,
  initial
}: {
  matchId: string;
  initial: {
    ergebnisHeim: number | null;
    ergebnisGast: number | null;
    halbzeitHeim: number | null;
    halbzeitGast: number | null;
    heimName: string;
    gastName: string;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      ergebnisHeim: initial.ergebnisHeim ?? 0,
      ergebnisGast: initial.ergebnisGast ?? 0,
      halbzeitHeim: initial.halbzeitHeim ?? null,
      halbzeitGast: initial.halbzeitGast ?? null,
      reason: ""
    }
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      try {
        const res = await overrideMatchResultAction({
          matchId,
          ergebnisHeim: values.ergebnisHeim,
          ergebnisGast: values.ergebnisGast,
          halbzeitHeim: values.halbzeitHeim ?? null,
          halbzeitGast: values.halbzeitGast ?? null,
          reason: values.reason
        });
        const detail =
          res.invalidatedCharges > 0
            ? ` · ${res.invalidatedCharges} Charge(s) zurückgesetzt`
            : "";
        toast.success(`Ergebnis überschrieben${detail}`);
        setOpen(false);
        form.reset();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler beim Override");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Ergebnis korrigieren
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display font-bold text-xl tracking-tight">
            Ergebnis manuell korrigieren
          </DialogTitle>
          <DialogDescription className="space-y-2 pt-2">
            <span className="block">
              Setzt das Endergebnis und (optional) das Halbzeitergebnis neu.
              Alle ergebnis-bezogenen Charges werden zurückgesetzt, eine
              Neuauswertung läuft automatisch.
            </span>
            <span className="block text-xs text-brand-night-navy/60">
              Bereits in Rechnung gestellte Charges bleiben unverändert.
            </span>
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <div>
              <div className="text-xs uppercase tracking-widest font-bold text-brand-night-navy/60 mb-2">
                Endergebnis
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="ergebnisHeim"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">
                        {initial.heimName}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          max="30"
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
                  name="ergebnisGast"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">
                        {initial.gastName}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          max="30"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div>
              <div className="text-xs uppercase tracking-widest font-bold text-brand-night-navy/60 mb-2">
                Halbzeit (optional)
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="halbzeitHeim"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          max="30"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === "" ? null : Number(e.target.value)
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="halbzeitGast"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          max="30"
                          value={field.value ?? ""}
                          onChange={(e) =>
                            field.onChange(
                              e.target.value === "" ? null : Number(e.target.value)
                            )
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Grund für die Korrektur</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="z.B. Tor in der 89. Minute wurde nicht automatisch erkannt."
                      {...field}
                      rows={3}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    Wird im Audit-Log gespeichert (für interne Nachvollziehbarkeit).
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Abbrechen
              </Button>
              <Button type="submit" variant="accent" disabled={pending}>
                {pending ? "Speichere…" : "Korrektur speichern"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
