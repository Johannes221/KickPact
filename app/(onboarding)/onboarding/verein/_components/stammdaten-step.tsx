"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { clubStammdatenSchema, type ClubStammdaten } from "@/lib/validations/club";
import { track } from "@/lib/analytics/track";
import { finalizeOnboarding } from "../_actions/finalize";

export function StammdatenStep() {
  const router = useRouter();
  const params = useSearchParams();
  const [submitError, setSubmitError] = useState<string>("");
  const [submitting, startTransition] = useTransition();

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
    setSubmitError("");
    track("verein_onboarding_step3_completed");
    startTransition(async () => {
      try {
        // BUG-FIX 2026-05-25: Vorher wurden die Stammdaten als URL-Params an
        // Step 4 weitergegeben und der Verein erst in Step 5 (invite-step) in
        // der DB angelegt. Step 4 (Verifikation) erwartet aber einen
        // existierenden clubSlug → der existierte nie, Verifikations-Submit
        // failte still, der User landete ohne Membership in der DB.
        // Lösung: finalizeOnboarding jetzt schon hier nach Schritt 3.
        const result = await finalizeOnboarding({
          verein: {
            name: params.get("name") ?? "",
            vereinId: params.get("vereinId") ?? "",
            slug: params.get("slug") ?? ""
          },
          team: {
            name: params.get("teamName") ?? "",
            teamId: params.get("teamId") ?? "",
            slug: params.get("teamSlug") ?? "",
            saison: params.get("saison") ?? ""
          },
          stammdaten: {
            contactName: values.contactName,
            street: values.street,
            zip: values.zip,
            city: values.city,
            isSmallBusiness: values.isSmallBusiness,
            taxId: values.taxId || undefined,
            iban: values.iban || undefined
          },
          plan: (params.get("plan") as "basic" | "pro" | "verein") ?? "basic",
          cycle:
            (params.get("cycle") as "monthly" | "season" | "annual") ?? "monthly"
        });
        // Step 4 bekommt nur noch slug + invitationToken — die anderen
        // Stammdaten sind in der DB.
        const next = new URLSearchParams();
        next.set("slug", result.clubSlug);
        next.set("token", result.invitationToken);
        router.push(`/onboarding/verein/4?${next.toString()}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Fehler beim Anlegen des Vereins.";
        setSubmitError(msg);
        toast.error(msg);
      }
    });
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

        {submitError && (
          <div className="rounded-lg border border-brand-alert-red/30 bg-brand-alert-red/5 p-3 text-sm text-brand-alert-red">
            {submitError}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 pt-4">
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.back()}
            disabled={submitting}
            className="min-h-12 w-full sm:w-auto"
          >
            ← Zurück
          </Button>
          <Button
            type="submit"
            variant="accent"
            size="lg"
            disabled={submitting}
            className="min-h-12 w-full sm:w-auto"
          >
            {submitting ? "Verein wird angelegt…" : "Verein anlegen →"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
