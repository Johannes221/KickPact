"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { track } from "@/lib/analytics/track";
import { updateDraftStammdaten } from "../_actions/update-draft-stammdaten";

const formSchema = z.object({
  street: z.string().min(1, "Bitte Straße eingeben"),
  zip: z.string().min(4, "Mind. 4 Zeichen").max(10),
  city: z.string().min(1, "Bitte Stadt eingeben"),
  isSmallBusiness: z.boolean(),
  taxId: z.string().optional(),
  iban: z.string().optional()
});

type FormValues = z.infer<typeof formSchema>;

interface Props {
  clubId: string;
  role: "mannschaft" | "verein";
  defaultValues?: Partial<FormValues>;
}

export function StammdatenForm({ clubId, role, defaultValues }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      street: "",
      zip: "",
      city: "",
      isSmallBusiness: true,
      taxId: "",
      iban: "",
      ...defaultValues
    }
  });

  function onSubmit(values: FormValues) {
    setSubmitError("");
    track("verein_onboarding_step3_completed");
    startTransition(async () => {
      try {
        await updateDraftStammdaten({
          clubId,
          street: values.street,
          zip: values.zip,
          city: values.city,
          isSmallBusiness: values.isSmallBusiness,
          taxId: values.taxId || undefined,
          iban: values.iban || undefined
        });
        router.push(`/onboarding/${role}/sponsoren`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Konnte Stammdaten nicht speichern.";
        setSubmitError(msg);
        toast.error(msg);
      }
    });
  }

  const isSB = form.watch("isSmallBusiness");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-brand-night-navy/50">
            Vereins-Adresse
          </h3>
          <div className="grid gap-4 md:grid-cols-3">
            <FormField
              control={form.control}
              name="street"
              render={({ field }) => (
                <FormItem className="md:col-span-3">
                  <FormLabel className="text-sm font-medium text-brand-night-navy">
                    Straße + Hausnummer
                  </FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="street-address" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="zip"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-brand-night-navy">PLZ</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="postal-code" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel className="text-sm font-medium text-brand-night-navy">Stadt</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="address-level2" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <FormField
          control={form.control}
          name="isSmallBusiness"
          render={({ field }) => (
            <FormItem className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <FormLabel className="text-sm font-semibold text-brand-night-navy">
                    Kleinunternehmer (§19 UStG){" "}
                    <span className="text-xs font-normal text-brand-night-navy/50">— optional</span>
                  </FormLabel>
                  <FormDescription className="text-xs text-brand-night-navy/60">
                    Aktiviert lassen, wenn dein Verein nicht USt-pflichtig ist. Wir setzen
                    dann den §19-Hinweis auf die Sponsoren-Rechnungen. Lässt sich später im
                    Dashboard ändern.
                  </FormDescription>
                </div>
                <FormControl>
                  <input
                    type="checkbox"
                    checked={field.value}
                    onChange={(e) => field.onChange(e.target.checked)}
                    className="h-5 w-5 rounded border-brand-neutral text-accent focus:ring-accent mt-1 shrink-0"
                  />
                </FormControl>
              </div>
            </FormItem>
          )}
        />

        {!isSB && (
          <FormField
            control={form.control}
            name="taxId"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-brand-night-navy">USt-IdNr.</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="DE123456789" />
                </FormControl>
                <FormDescription className="text-xs text-brand-night-navy/60">
                  Erscheint auf den Sponsoren-Rechnungen.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="iban"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-brand-night-navy">
                IBAN <span className="text-xs font-normal text-brand-night-navy/50">— optional</span>
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="DE89 3704 0044 0532 0130 00"
                  className="font-mono"
                />
              </FormControl>
              <FormDescription className="text-xs text-brand-night-navy/60">
                Erscheint nur auf den Sponsoren-Rechnungen. KickPact nimmt nie Geld an. Du
                kannst die IBAN auch später im Dashboard eintragen.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {submitError && (
          <div className="rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-3 text-sm text-brand-alert-red">
            {submitError}
          </div>
        )}

        <div className="flex justify-end pt-4">
          <Button type="submit" variant="accent" size="lg" disabled={pending}>
            {pending ? "Speichere…" : "Weiter →"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
