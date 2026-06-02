"use client";

import { useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { submitProblemReport } from "@/lib/actions/support";

// Sentinel aus requireUserOrThrow (server). Bewusst als Literal, um keinen
// server-only Code (next/headers) in die Client-Komponente zu ziehen.
const SESSION_EXPIRED_MESSAGE = "SESSION_EXPIRED";

const CATEGORY_LABELS = {
  frage: "Allgemeine Frage",
  bug: "Fehler / Bug",
  abrechnung: "Abrechnung / Zahlung",
  spieldaten: "Spieldaten / Ergebnis",
  sonstiges: "Sonstiges"
} as const;

const schema = z.object({
  name: z.string().min(2, "Bitte Namen angeben"),
  email: z.string().email("Bitte gültige E-Mail eingeben"),
  category: z.enum(["frage", "bug", "abrechnung", "spieldaten", "sonstiges"]),
  subject: z.string().min(3, "Bitte Betreff angeben").max(150),
  message: z.string().min(10, "Bitte beschreibe dein Anliegen (mind. 10 Zeichen)").max(5000)
});
type FormValues = z.infer<typeof schema>;

export interface ReportContext {
  contextType?: "none" | "match" | "invoice" | "pledge" | "team" | "page";
  contextId?: string | null;
  contextUrl?: string | null;
  contextMeta?: Record<string, unknown> | null;
  clubId?: string | null;
  teamId?: string | null;
}

export function ReportProblemForm({
  defaults,
  defaultCategory = "frage",
  context,
  onDone
}: {
  defaults?: { name?: string; email?: string };
  defaultCategory?: FormValues["category"];
  context?: ReportContext;
  onDone?: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<{ reference: string; ticketId: string } | null>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaults?.name ?? "",
      email: defaults?.email ?? "",
      category: defaultCategory,
      subject: "",
      message: ""
    }
  });

  async function onSubmit(values: FormValues) {
    setPending(true);
    const res = await submitProblemReport({ ...values, ...context });
    setPending(false);
    if (res.ok) {
      setDone({ reference: res.reference, ticketId: res.ticketId });
      form.reset();
    } else if (res.error === SESSION_EXPIRED_MESSAGE) {
      window.location.reload();
    } else {
      form.setError("message", { message: res.error ?? "Senden fehlgeschlagen" });
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-brand-neutral/40 bg-white p-6 text-center">
        <p className="font-display font-black text-lg text-brand-night-navy">Danke!</p>
        <p className="mt-1 text-sm text-brand-night-navy/60">
          Deine Meldung ist bei uns ({done.reference}). Wir melden uns per E-Mail — den Verlauf
          findest du jederzeit unter „Meine Anfragen".
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button asChild variant="accent" size="sm">
            <Link href={`/konto/support/${done.ticketId}`} onClick={onDone}>
              Zur Anfrage
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => (onDone ? onDone() : setDone(null))}>
            Schließen
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {!defaults?.name && (
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
        )}
        {defaults?.name && <input type="hidden" {...form.register("name")} />}
        {!defaults?.email && (
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
        )}
        {defaults?.email && <input type="hidden" {...form.register("email")} />}
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
          {pending ? "Senden..." : "Problem melden"}
        </Button>
      </form>
    </Form>
  );
}
