"use client";

import { useTransition } from "react";
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
import { sponsorOnboardingSchema, SPONSOR_ROLES, type SponsorOnboardingInput } from "@/lib/validations/sponsor";
import { createSponsor } from "../_actions/create-sponsor";
import { toast } from "sonner";
import { track } from "@/lib/analytics/track";

/**
 * Sponsor-Onboarding, Privatpersonen-only (Spec 2026-07-06): kein Typ-Step
 * mehr (die frühere Wahl „Familie/Freund vs. Unternehmen" ist entfallen,
 * KickPact-Sponsoren sind ausschließlich Privatpersonen). Direkt Name,
 * Beziehung zur Mannschaft, fertig.
 */
export function SponsorTypeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const invitationToken = params.get("invitation");
  const [pending, startTransition] = useTransition();

  const form = useForm<SponsorOnboardingInput>({
    resolver: zodResolver(sponsorOnboardingSchema),
    defaultValues: {
      type: "familie",
      displayName: "",
      role: "",
      description: ""
    }
  });

  function onSubmit(values: SponsorOnboardingInput) {
    startTransition(async () => {
      try {
        await createSponsor(values, invitationToken ?? undefined);
        track("sponsor_onboarding_completed", { type: values.type });
        toast.success("Profil angelegt 🎉");
        if (invitationToken) {
          router.push(`/sponsor/pledge/new?invitation=${invitationToken}`);
        } else {
          router.push("/sponsor");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Fehler beim Anlegen");
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        {/* Name */}
        <FormField
          control={form.control}
          name="displayName"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-brand-night-navy">
                Dein Anzeige-Name
              </FormLabel>
              <FormControl>
                <Input {...field} placeholder="Tante Erna" />
              </FormControl>
              <FormDescription className="text-xs text-brand-night-navy/60">
                So sieht dich die Mannschaft. Spitzname reicht völlig.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Beziehung zur Mannschaft */}
        <div className="space-y-4 rounded-lg border border-brand-neutral/40 bg-brand-off-white p-5">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-brand-night-navy/50">
            Wie stehst du zur Mannschaft?
          </h3>
          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-brand-night-navy">Rolle</FormLabel>
                <FormControl>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={field.value ?? ""}
                    onChange={field.onChange}
                  >
                    <option value="">— wählen —</option>
                    {SPONSOR_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-sm font-medium text-brand-night-navy">
                  Beschreibung <span className="text-brand-night-navy/40 font-normal">(optional)</span>
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder="z.B. Papa von Tim · Onkel von Lisa · Freund von Max"
                  />
                </FormControl>
                <FormDescription className="text-xs text-brand-night-navy/60">
                  Hilft dem Verein einzuordnen, wer du bist.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" variant="accent" size="lg" disabled={pending} className="w-full min-h-[44px]">
          {pending ? "Speichere…" : "Weiter →"}
        </Button>
      </form>
    </Form>
  );
}
