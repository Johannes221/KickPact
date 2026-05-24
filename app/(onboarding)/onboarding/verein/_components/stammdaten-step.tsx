"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { clubStammdatenSchema, type ClubStammdaten } from "@/lib/validations/club";
import { track } from "@/lib/analytics/track";

export function StammdatenStep() {
  const router = useRouter();
  const params = useSearchParams();

  const form = useForm<ClubStammdaten>({
    resolver: zodResolver(clubStammdatenSchema),
    defaultValues: {
      contactName: "",
      street: "",
      zip: "",
      city: "",
      isSmallBusiness: true,
      taxId: "",
      iban: ""
    }
  });

  function onSubmit(values: ClubStammdaten) {
    track("verein_onboarding_step3_completed");
    const next = new URLSearchParams(params.toString());
    next.set("contactName", values.contactName);
    next.set("street", values.street);
    next.set("zip", values.zip);
    next.set("city", values.city);
    next.set("isSmallBusiness", String(values.isSmallBusiness));
    if (values.taxId) next.set("taxId", values.taxId);
    if (values.iban) next.set("iban", values.iban);
    router.push(`/onboarding/verein/4?${next.toString()}`);
  }

  const isSB = form.watch("isSmallBusiness");

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Kontakt */}
        <FormField
          control={form.control}
          name="contactName"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-brand-night-navy">
                Dein Name (Kontaktperson)
              </FormLabel>
              <FormControl>
                <Input {...field} autoComplete="name" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Adresse */}
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
                  <FormLabel className="text-sm font-medium text-brand-night-navy">
                    PLZ
                  </FormLabel>
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
                  <FormLabel className="text-sm font-medium text-brand-night-navy">
                    Stadt
                  </FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="address-level2" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Kleinunternehmer-Toggle */}
        <FormField
          control={form.control}
          name="isSmallBusiness"
          render={({ field }) => (
            <FormItem className="rounded-lg border border-brand-neutral/40 bg-brand-off-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <FormLabel className="text-sm font-semibold text-brand-night-navy">
                    Kleinunternehmer (§19 UStG) <span className="text-xs font-normal text-brand-night-navy/50">— optional</span>
                  </FormLabel>
                  <FormDescription className="text-xs text-brand-night-navy/60">
                    Aktiviert lassen, wenn deine Mannschaft nicht USt-pflichtig ist. Wir
                    setzen dann den §19-Hinweis auf die Sponsoren-Rechnungen. Kannst du
                    auch später im Dashboard ändern.
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

        {/* USt-ID — nur wenn nicht-KU */}
        {!isSB && (
          <FormField
            control={form.control}
            name="taxId"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-semibold text-brand-night-navy">
                  USt-IdNr.
                </FormLabel>
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

        {/* IBAN — optional */}
        <FormField
          control={form.control}
          name="iban"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-brand-night-navy">
                IBAN <span className="text-xs font-normal text-brand-night-navy/50">— optional, kann später ergänzt werden</span>
              </FormLabel>
              <FormControl>
                <Input
                  {...field}
                  placeholder="DE89 3704 0044 0532 0130 00"
                  className="font-mono"
                />
              </FormControl>
              <FormDescription className="text-xs text-brand-night-navy/60">
                Wird nur auf den Sponsoren-Rechnungen abgedruckt — vertraulich behandelt.
                KickPact nimmt nie Geld an. Du kannst die IBAN auch später im Dashboard
                eintragen, bevor die erste Rechnung rausgeht.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-between pt-4">
          <Button type="button" variant="ghost" onClick={() => router.back()}>
            ← Zurück
          </Button>
          <Button type="submit" variant="accent" size="lg">
            Weiter →
          </Button>
        </div>
      </form>
    </Form>
  );
}
