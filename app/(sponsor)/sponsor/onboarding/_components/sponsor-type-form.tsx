"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
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
import { sponsorOnboardingSchema, type SponsorOnboardingInput } from "@/lib/validations/sponsor";
import { createSponsor } from "../_actions/create-sponsor";
import { toast } from "sonner";
import { track } from "@/lib/analytics/track";

export function SponsorTypeForm() {
  const router = useRouter();
  const params = useSearchParams();
  const invitationToken = params.get("invitation");
  const [pending, startTransition] = useTransition();
  const [proxyEnabled, setProxyEnabled] = useState(false);

  const form = useForm<SponsorOnboardingInput>({
    resolver: zodResolver(sponsorOnboardingSchema),
    defaultValues: {
      type: "familie",
      displayName: "",
      pledgeProxies: []
    } as SponsorOnboardingInput
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "pledgeProxies"
  });

  const type = form.watch("type");
  const proxies = form.watch("pledgeProxies") ?? [];
  const proxySum = proxies.reduce(
    (s, p) => s + (typeof p?.sharePercent === "number" ? p.sharePercent : 0),
    0
  );
  const proxySumOk = proxies.length === 0 || proxySum === 100;

  function toggleProxy(next: boolean) {
    setProxyEnabled(next);
    if (!next) {
      // Wenn deaktiviert → Array leeren, sonst greift Zod-Refine
      form.setValue("pledgeProxies", [], { shouldValidate: true });
    } else if (fields.length === 0) {
      // Erste Zeile vorausfüllen
      append({ name: "", sharePercent: 100, note: "" });
    }
  }

  function onSubmit(values: SponsorOnboardingInput) {
    // Wenn Toggle aus → Proxies definitiv leeren
    const payload: SponsorOnboardingInput = proxyEnabled
      ? values
      : { ...values, pledgeProxies: [] };

    startTransition(async () => {
      try {
        await createSponsor(payload, invitationToken ?? undefined);
        track("sponsor_onboarding_completed", {
          type: payload.type,
          hasProxies: (payload.pledgeProxies?.length ?? 0) > 0
        });
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

        {/* Eltern-Proxy / Sub-Sponsoren */}
        <div className="space-y-4 rounded-lg border border-brand-neutral/40 bg-brand-off-white p-5">
          <div className="flex items-start gap-3">
            <input
              id="proxy-toggle"
              type="checkbox"
              checked={proxyEnabled}
              onChange={(e) => toggleProxy(e.target.checked)}
              className="mt-1 h-5 w-5 cursor-pointer accent-accent"
            />
            <div className="flex-1">
              <Label
                htmlFor="proxy-toggle"
                className="cursor-pointer text-sm font-semibold text-brand-night-navy"
              >
                Ich verwalte für mehrere Personen
              </Label>
              <p className="mt-1 text-xs text-brand-night-navy/60">
                Z.B. als Elternteil für Familie + Verwandte (Oma, Onkel, Patentanten).
                Auf der Rechnung wird intern aufgeteilt — du verteilst das Geld privat.
              </p>
            </div>
          </div>

          {proxyEnabled && (
            <div className="space-y-3">
              <div className="space-y-3">
                {fields.map((f, idx) => (
                  <ProxyRow
                    key={f.id}
                    index={idx}
                    onRemove={() => remove(idx)}
                    control={form.control}
                  />
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ name: "", sharePercent: 0, note: "" })}
                  className="min-h-[44px]"
                >
                  + Person hinzufügen
                </Button>
                <div
                  className={
                    "text-xs " +
                    (proxySumOk
                      ? "text-brand-night-navy/60"
                      : "font-semibold text-red-600")
                  }
                  aria-live="polite"
                >
                  Summe: {proxySum}% {proxySumOk ? "✓" : "(muss 100% sein)"}
                </div>
              </div>

              {form.formState.errors.pledgeProxies?.root?.message && (
                <p className="text-xs font-medium text-red-600">
                  {form.formState.errors.pledgeProxies.root.message}
                </p>
              )}
            </div>
          )}
        </div>

        <Button type="submit" variant="accent" size="lg" disabled={pending} className="w-full min-h-[44px]">
          {pending ? "Speichere…" : "Weiter →"}
        </Button>
      </form>
    </Form>
  );
}

function ProxyRow({
  index,
  onRemove,
  control
}: {
  index: number;
  onRemove: () => void;
  // react-hook-form Control ist generisch; wir verwenden hier den abgeleiteten Typ
  // aus dem Form oben, ohne `any`.
  control: ReturnType<typeof useForm<SponsorOnboardingInput>>["control"];
}) {
  return (
    <div className="rounded-md border border-brand-neutral/40 bg-white p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <FormField
            control={control}
            name={`pledgeProxies.${index}.name` as const}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-brand-night-navy/70">Name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="Oma Hilde"
                    className="min-h-[44px]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="w-full sm:w-28">
          <FormField
            control={control}
            name={`pledgeProxies.${index}.sharePercent` as const}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-brand-night-navy/70">Anteil %</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    step={1}
                    value={typeof field.value === "number" ? field.value : 0}
                    onChange={(e) => {
                      const v = e.target.value === "" ? 0 : Number(e.target.value);
                      field.onChange(Number.isFinite(v) ? v : 0);
                    }}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                    className="min-h-[44px]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <FormField
            control={control}
            name={`pledgeProxies.${index}.note` as const}
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs text-brand-night-navy/70">
                  Notiz (optional)
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={field.value ?? ""}
                    placeholder="Patentante"
                    className="min-h-[44px]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          className="min-h-[44px] text-red-600 hover:text-red-700 sm:self-end"
        >
          Entfernen
        </Button>
      </div>
    </div>
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
          <div className="font-display font-black text-base tracking-tight text-brand-night-navy">
            {title}
          </div>
          <p className="mt-1 text-xs text-brand-night-navy/60">{description}</p>
        </div>
      </div>
    </Label>
  );
}
