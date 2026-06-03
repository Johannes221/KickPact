"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { sponsorOnboardingSchema, SPONSOR_ROLES, type SponsorOnboardingInput } from "@/lib/validations/sponsor";
import { createSponsor } from "../_actions/create-sponsor";
import { toast } from "sonner";
import { track } from "@/lib/analytics/track";

export function SponsorTypeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const invitationToken = params.get("invitation");
  const [pending, startTransition] = useTransition();

  const form = useForm<SponsorOnboardingInput>({
    resolver: zodResolver(sponsorOnboardingSchema),
    defaultValues: {
      type: "familie",
      displayName: ""
    } as SponsorOnboardingInput
  });

  const type = form.watch("type");

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
        {/* Typ-Wahl */}
        <FormField
          control={form.control}
          name="type"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-sm font-semibold text-brand-night-navy">
                Wer bist du?
              </FormLabel>
              <FormControl>
                <RadioGroup
                  value={field.value}
                  onValueChange={field.onChange}
                  className="grid gap-3 md:grid-cols-2"
                >
                  <TypeCard
                    value="familie"
                    title="💚  Familie / Freund"
                    description="Du sponserst privat. Keine USt-Rechnung nötig."
                    selected={field.value === "familie"}
                  />
                  <TypeCard
                    value="business"
                    title="🏢  Unternehmen"
                    description="Du sponserst als Firma. Wir erzeugen eine USt-konforme Werbeleistungs-Rechnung."
                    selected={field.value === "business"}
                  />
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
                <Input {...field} placeholder={type === "familie" ? "Tante Erna" : "Bäckerei Müller"} />
              </FormControl>
              <FormDescription className="text-xs text-brand-night-navy/60">
                Erscheint dem Verein als Sponsor-Bezeichnung.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Privat-Felder — nur wenn type=familie */}
        {type === "familie" && (
          <div className="space-y-4 rounded-lg border border-brand-neutral/40 bg-brand-off-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-brand-night-navy/50">
              Wie stehst du zur Mannschaft?
            </h3>
            <FormField
              control={form.control}
              name={"role" as never}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-brand-night-navy">Rolle</FormLabel>
                  <FormControl>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={(field.value as string) ?? ""}
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
              name={"description" as never}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-brand-night-navy">
                    Beschreibung <span className="text-brand-night-navy/40 font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={(field.value as string) ?? ""}
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
        )}

        {/* Business-Felder — nur wenn type=business */}
        {type === "business" && (
          <div className="space-y-4 rounded-lg border border-brand-neutral/40 bg-brand-off-white p-5">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-brand-night-navy/50">
              Firmen-Daten für die Rechnung
            </h3>
            <FormField
              control={form.control}
              name={"businessName" as never}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-brand-night-navy">
                    Firmenname
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Bäckerei Müller GmbH" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name={"street" as never}
                render={({ field }) => (
                  <FormItem className="md:col-span-3">
                    <FormLabel className="text-sm font-medium text-brand-night-navy">
                      Straße + Hausnummer
                    </FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={"zip" as never}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-brand-night-navy">PLZ</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={"city" as never}
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel className="text-sm font-medium text-brand-night-navy">Stadt</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name={"businessTaxId" as never}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-brand-night-navy">
                    USt-IdNr. (optional)
                  </FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="DE123456789" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <Button type="submit" variant="accent" size="lg" disabled={pending} className="w-full min-h-[44px]">
          {pending ? "Speichere…" : "Weiter →"}
        </Button>
      </form>
    </Form>
  );
}

function TypeCard({
  value,
  title,
  description,
  selected
}: {
  value: "familie" | "business";
  title: string;
  description: string;
  selected: boolean;
}) {
  return (
    <Label
      htmlFor={`type-${value}`}
      className={
        "block rounded-2xl border p-4 cursor-pointer transition-colors " +
        (selected ? "border-accent bg-accent/5" : "border-brand-neutral/40 bg-white hover:border-accent/40")
      }
    >
      <div className="flex items-start gap-3">
        <RadioGroupItem value={value} id={`type-${value}`} />
        <div>
          <div className="font-display font-bold text-base tracking-tight text-brand-night-navy">
            {title}
          </div>
          <p className="mt-1 text-xs text-brand-night-navy/60">{description}</p>
        </div>
      </div>
    </Label>
  );
}
