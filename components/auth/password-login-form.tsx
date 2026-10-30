"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/**
 * E-Mail + Passwort-Login. Bewusst zurückgenommen (per „Mit Passwort anmelden"
 * aufklappbar): der Normalweg bleibt Magic-Link/Apple/Google. Gebraucht für
 * Operator-Accounts und — wichtig — den App-Store-Review-Zugang: in der nativen
 * App ist Magic-Link nicht verfügbar (Mail-Link öffnet in Safari, Session landet
 * dort), Passwort-Login läuft dagegen komplett in der WebView (Session-Cookie
 * bleibt in der App). `disableSignUp` gilt weiter — nur bestehende Accounts mit
 * gesetztem Passwort kommen hier rein.
 */
const schema = z.object({
  email: z.string().email("Bitte gültige E-Mail eingeben"),
  password: z.string().min(1, "Passwort eingeben")
});
type FormValues = z.infer<typeof schema>;

export function PasswordLoginForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" }
  });

  async function onSubmit(values: FormValues) {
    setPending(true);
    const { error } = await signIn.email({
      email: values.email,
      password: values.password,
      callbackURL: "/dashboard"
    });
    setPending(false);
    if (error) {
      toast.error("Anmeldung fehlgeschlagen. E-Mail oder Passwort prüfen.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full text-center text-[13px] font-medium text-brand-night-navy/50 underline-offset-2 hover:underline"
      >
        Mit Passwort anmelden
      </button>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="mt-4 space-y-3">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-Mail</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="username" placeholder="name@verein.de" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Passwort</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="current-password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Anmelden…" : "Anmelden"}
        </Button>
      </form>
    </Form>
  );
}
