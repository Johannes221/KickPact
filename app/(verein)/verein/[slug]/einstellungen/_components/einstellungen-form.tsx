"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { updateClubSettings, type UpdateClubInput } from "@/lib/actions/club-settings";

const schema = z.object({
  name: z.string().min(2, "Vereinsname fehlt"),
  ort: z.string().optional().or(z.literal("")),
  street: z.string().min(2, "Straße fehlt"),
  zip: z.string().min(4, "PLZ fehlt"),
  city: z.string().min(2, "Stadt fehlt"),
  isSmallBusiness: z.boolean(),
  taxId: z.string().optional().or(z.literal("")),
  iban: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || v.length >= 15, "IBAN zu kurz")
    .refine((v) => !v || v.length <= 34, "IBAN zu lang"),
  paypalHandle: z.string().max(120).optional().or(z.literal("")),
  stripePaymentLink: z
    .string()
    .optional()
    .or(z.literal(""))
    .refine(
      (v) => !v || v.trim().startsWith("https://buy.stripe.com/"),
      "Muss mit https://buy.stripe.com/ beginnen"
    )
});

type FormValues = z.infer<typeof schema>;

export function EinstellungenForm({
  slug,
  defaultValues,
  variant = "verein"
}: {
  slug: string;
  defaultValues: UpdateClubInput;
  /**
   * Steuert nur die Beschriftung des Stammdaten-Blocks. Im Mannschafts-Kontext
   * (basic/pro) ist die Mannschaft die Billing-Entität — technisch wird aber
   * dieselbe club-Row editiert (eine Subscription/IBAN pro Club).
   */
  variant?: "verein" | "mannschaft";
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues
  });

  const isSmallBusiness = form.watch("isSmallBusiness");

  function onSubmit(values: FormValues) {
    setSaved(false);
    startTransition(async () => {
      const res = await updateClubSettings(slug, values);
      if (res.error) {
        toast.error(res.error);
      } else {
        toast.success("Gespeichert ✓");
        setSaved(true);
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Vereinsdaten */}
        <section className="rounded-2xl bg-white shadow-ios-card p-5 md:p-6 space-y-5">
          <h3 className="font-display font-bold text-base md:text-lg tracking-tight text-brand-night-navy">
            {variant === "mannschaft" ? "Rechnungs-Stammdaten" : "Vereins-Stammdaten"}
          </h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>
                    {variant === "mannschaft" ? "Name auf Rechnungen" : "Vereinsname"}
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="FC Musterstadt 1920 e.V." />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="ort"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Ort / Region <span className="text-brand-night-navy/60 font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="z.B. Musterstadt" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        {/* Adresse */}
        <section className="rounded-2xl bg-white shadow-ios-card p-5 md:p-6 space-y-5">
          <h3 className="font-display font-bold text-base md:text-lg tracking-tight text-brand-night-navy">
            Rechnungsadresse
          </h3>
          <p className="text-xs text-brand-night-navy/60 -mt-2">
            Erscheint auf PDF-Rechnungen als Absender-Adresse.
          </p>

          <div className="grid gap-4 sm:grid-cols-6">
            <FormField
              control={form.control}
              name="street"
              render={({ field }) => (
                <FormItem className="sm:col-span-4">
                  <FormLabel>Straße &amp; Hausnummer</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Musterstraße 1" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="zip"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>PLZ</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="12345" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem className="sm:col-span-6">
                  <FormLabel>Stadt</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Musterstadt" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </section>

        {/* Steuer */}
        <section className="rounded-2xl bg-white shadow-ios-card p-5 md:p-6 space-y-5">
          <h3 className="font-display font-bold text-base md:text-lg tracking-tight text-brand-night-navy">
            Steuer &amp; IBAN
          </h3>

          <FormField
            control={form.control}
            name="isSmallBusiness"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-start gap-3">
                  <FormControl>
                    <input
                      type="checkbox"
                      id="smallbusiness"
                      checked={field.value}
                      onChange={field.onChange}
                      className="mt-0.5 h-4 w-4 rounded border-brand-neutral text-accent focus:ring-accent"
                    />
                  </FormControl>
                  <div className="space-y-1">
                    <FormLabel htmlFor="smallbusiness" className="cursor-pointer">
                      §19 UStG — Kleinunternehmer
                    </FormLabel>
                    <FormDescription className="text-xs">
                      {isSmallBusiness
                        ? "Euer Verein nutzt die Kleinunternehmer-Regelung (§19 UStG)."
                        : "Euer Verein weist auf eigenen Rechnungen USt aus — USt-ID unbedingt ausfüllen."}
                    </FormDescription>
                  </div>
                </div>
              </FormItem>
            )}
          />

          {!isSmallBusiness && (
            <FormField
              control={form.control}
              name="taxId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Umsatzsteuer-ID</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="DE123456789" className="font-mono" />
                  </FormControl>
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
                <FormLabel>
                  IBAN <span className="text-brand-night-navy/60 font-normal">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="DE89 3704 0044 0532 0130 00"
                    className="font-mono"
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  Erscheint auf Rechnungen als Zahlungsziel. Kann auch später ergänzt werden.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        {/* Zusatz-Zahlwege (Spec §1.9): erscheinen auf Rechnung + Rechnungs-Mail
            zusätzlich zum Girocode/IBAN-Block. */}
        <section className="rounded-2xl bg-white shadow-ios-card p-5 md:p-6 space-y-5">
          <div>
            <h3 className="font-display font-bold text-base md:text-lg tracking-tight text-brand-night-navy">
              Weitere Zahlwege
            </h3>
            <p className="mt-1 text-xs text-brand-night-navy/60">
              Optional: Sponsoren können dann zusätzlich zur Überweisung per PayPal oder
              Karte zahlen. Die Links erscheinen auf der Rechnung — das Geld geht direkt
              an euch, KickPact ist nicht beteiligt.
            </p>
          </div>

          <FormField
            control={form.control}
            name="paypalHandle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  PayPal.Me-Name{" "}
                  <span className="text-brand-night-navy/60 font-normal">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Input {...field} placeholder="z.B. fcmusterstadt" className="font-mono" />
                </FormControl>
                <FormDescription className="text-xs">
                  Nur der Name aus eurem paypal.me-Link — „paypal.me/fcmusterstadt" oder
                  „@fcmusterstadt" werden automatisch erkannt.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="stripePaymentLink"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Stripe Payment Link{" "}
                  <span className="text-brand-night-navy/60 font-normal">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="https://buy.stripe.com/…"
                    className="font-mono"
                  />
                </FormControl>
                <FormDescription className="text-xs">
                  Für Kartenzahlung — den Link erstellt ihr in eurem eigenen
                  Stripe-Konto.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        <div className="flex items-center gap-3 justify-end">
          {saved && (
            <span className="text-sm text-emerald-600 font-semibold">Gespeichert ✓</span>
          )}
          <Button type="submit" variant="accent" disabled={pending}>
            {pending ? "Speichere…" : "Änderungen speichern"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
