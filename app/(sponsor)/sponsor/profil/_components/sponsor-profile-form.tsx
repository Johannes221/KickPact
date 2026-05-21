"use client";

import { useTransition, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  updateSponsorProfile,
  type UpdateSponsorInput
} from "@/lib/actions/sponsor-profile";

const familieSchema = z.object({
  type: z.literal("familie"),
  displayName: z.string().min(2, "Name fehlt")
});

const businessSchema = z.object({
  type: z.literal("business"),
  displayName: z.string().min(2, "Name fehlt"),
  businessName: z.string().min(2, "Firmenname fehlt"),
  street: z.string().min(2, "Straße fehlt"),
  zip: z.string().min(4, "PLZ fehlt"),
  city: z.string().min(2, "Stadt fehlt"),
  businessTaxId: z.string().optional().or(z.literal(""))
});

type FamilieValues = z.infer<typeof familieSchema>;
type BusinessValues = z.infer<typeof businessSchema>;

function FamilieForm({ defaultValues }: { defaultValues: FamilieValues }) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const form = useForm<FamilieValues>({
    resolver: zodResolver(familieSchema),
    defaultValues
  });

  function onSubmit(values: FamilieValues) {
    setSaved(false);
    startTransition(async () => {
      const res = await updateSponsorProfile(values as UpdateSponsorInput);
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <section className="rounded-2xl border border-brand-neutral/40 bg-white p-5 md:p-6 space-y-5">
          <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
            Dein Profil
          </h3>

          <FormField
            control={form.control}
            name="displayName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Anzeigename</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Familie Mustermann" />
                </FormControl>
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

function BusinessForm({ defaultValues }: { defaultValues: BusinessValues }) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const form = useForm<BusinessValues>({
    resolver: zodResolver(businessSchema),
    defaultValues
  });

  function onSubmit(values: BusinessValues) {
    setSaved(false);
    startTransition(async () => {
      const res = await updateSponsorProfile(values as UpdateSponsorInput);
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
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Stammdaten */}
        <section className="rounded-2xl border border-brand-neutral/40 bg-white p-5 md:p-6 space-y-5">
          <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
            Stammdaten
          </h3>

          <FormField
            control={form.control}
            name="displayName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Anzeigename</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Musterfirma GmbH" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="businessName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Firmenname (für Rechnungen)</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Musterfirma GmbH" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </section>

        {/* Adresse */}
        <section className="rounded-2xl border border-brand-neutral/40 bg-white p-5 md:p-6 space-y-5">
          <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
            Rechnungsadresse
          </h3>
          <p className="text-xs text-brand-night-navy/60 -mt-2">
            Erscheint auf PDF-Rechnungen.
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
        <section className="rounded-2xl border border-brand-neutral/40 bg-white p-5 md:p-6 space-y-5">
          <h3 className="font-display font-black text-base md:text-lg tracking-tight text-brand-night-navy">
            Steuer
          </h3>

          <FormField
            control={form.control}
            name="businessTaxId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Umsatzsteuer-ID{" "}
                  <span className="text-brand-night-navy/40 font-normal">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="DE123456789"
                    className="font-mono"
                  />
                </FormControl>
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

export function SponsorProfileForm({
  sponsorType,
  defaultValues
}: {
  sponsorType: "familie" | "business";
  defaultValues: UpdateSponsorInput;
}) {
  if (sponsorType === "familie") {
    return <FamilieForm defaultValues={defaultValues as FamilieValues} />;
  }
  return <BusinessForm defaultValues={defaultValues as BusinessValues} />;
}
