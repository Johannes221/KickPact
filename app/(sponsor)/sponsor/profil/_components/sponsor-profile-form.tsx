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
import { SPONSOR_ROLES } from "@/lib/validations/sponsor";

/**
 * Sponsor-Profil, Privatpersonen-only (Spec 2026-07-06): Die frühere
 * BusinessForm (Firmenname, Rechnungsadresse, USt-ID) ist ersatzlos entfallen.
 */
const profileSchema = z.object({
  type: z.literal("familie"),
  displayName: z.string().min(2, "Name fehlt"),
  role: z.string().max(40).optional().or(z.literal("")),
  description: z.string().max(200, "Max. 200 Zeichen").optional().or(z.literal(""))
});

type ProfileValues = z.infer<typeof profileSchema>;

export function SponsorProfileForm({
  defaultValues
}: {
  defaultValues: UpdateSponsorInput;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues
  });

  function onSubmit(values: ProfileValues) {
    setSaved(false);
    startTransition(async () => {
      const res = await updateSponsorProfile(values);
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
        <section className="rounded-2xl bg-white shadow-ios-card p-5 md:p-6 space-y-5">
          <h3 className="font-display font-bold text-base md:text-lg tracking-tight text-brand-night-navy">
            Dein Profil
          </h3>
          <p className="text-xs text-brand-night-navy/60 -mt-3">
            Sag dem Verein kurz, wer du bist. Dein Name reicht, alles andere ist Kür.
          </p>

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

          <FormField
            control={form.control}
            name="role"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rolle</FormLabel>
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
                <FormLabel>Beschreibung <span className="text-brand-night-navy/60 font-normal">(optional)</span></FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} placeholder="z.B. Papa von Tim · Onkel von Lisa · Freund von Max" />
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
