"use client";

import { useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitSupportTicket } from "@/app/(marketing)/hilfe/kontakt/_actions/submit";

const schema = z.object({
  name: z.string().min(2, "Bitte Namen angeben"),
  email: z.string().email("Bitte gültige E-Mail eingeben"),
  category: z.enum(["frage", "bug", "abrechnung", "sonstiges"]),
  subject: z.string().min(3, "Bitte Betreff angeben").max(150),
  message: z.string().min(10, "Bitte beschreibe dein Anliegen (mind. 10 Zeichen)").max(5000),
  // Honeypot — für Menschen unsichtbar (siehe Markup unten).
  website: z.string().optional()
});
type FormValues = z.infer<typeof schema>;

const CATEGORY_LABELS: Record<FormValues["category"], string> = {
  frage: "Allgemeine Frage",
  bug: "Fehler / Bug",
  abrechnung: "Abrechnung / Zahlung",
  sonstiges: "Sonstiges"
};

export function ContactForm({ defaults }: { defaults?: { name?: string; email?: string } }) {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaults?.name ?? "",
      email: defaults?.email ?? "",
      category: "frage",
      subject: "",
      message: "",
      website: ""
    }
  });

  async function onSubmit(values: FormValues) {
    setPending(true);
    const res = await submitSupportTicket(values);
    setPending(false);
    if (res.ok) {
      setSent(true);
      form.reset();
    } else {
      form.setError("message", { message: res.error ?? "Senden fehlgeschlagen" });
    }
  }

  if (sent) {
    return (
      <div className="rounded-2xl bg-white shadow-ios-card p-6 text-center">
        <p className="font-display font-bold text-lg text-brand-night-navy">Danke!</p>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          Wir haben deine Anfrage erhalten und melden uns per E-Mail.
        </p>
        <Button variant="ghost" className="mt-4" onClick={() => setSent(false)}>
          Weitere Anfrage senden
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {/* Honeypot: absichtlich versteckt; nur Bots füllen das aus. */}
        <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
          <label>
            Website
            <input type="text" tabIndex={-1} autoComplete="off" {...form.register("website")} />
          </label>
        </div>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Vor- und Nachname" autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-Mail</FormLabel>
              <FormControl>
                <Input type="email" placeholder="du@beispiel.de" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Kategorie</FormLabel>
              <FormControl>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  {...field}
                >
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="subject"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Betreff</FormLabel>
              <FormControl>
                <Input placeholder="Worum geht's?" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="message"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nachricht</FormLabel>
              <FormControl>
                <Textarea rows={6} placeholder="Beschreib dein Anliegen möglichst genau." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" variant="accent" className="w-full" disabled={pending}>
          {pending ? "Senden..." : "Anfrage senden"}
        </Button>
      </form>
    </Form>
  );
}
