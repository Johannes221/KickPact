"use client";

import { useState } from "react";
import Link from "next/link";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const schema = z.object({ email: z.string().email("Bitte gültige E-Mail eingeben") });
type FormValues = z.infer<typeof schema>;

export function OperatorForgotForm() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" }
  });

  async function onSubmit(values: FormValues) {
    setPending(true);
    // Fehler bewusst verschluckt (kein Account-Enumeration). Wir zeigen immer
    // dieselbe Bestätigung, egal ob die E-Mail existiert oder Operator ist.
    await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: "/admin/reset-password"
    });
    setPending(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">
          Falls ein Operator-Account mit dieser E-Mail existiert, haben wir dir einen Link zum
          Zurücksetzen geschickt. Der Link ist 60 Minuten gültig.
        </p>
        <Link href="/admin/login" className="text-sm font-medium text-accent hover:underline">
          Zurück zum Login
        </Link>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-Mail</FormLabel>
              <FormControl>
                <Input type="email" placeholder="operator@kickpact.de" autoComplete="username" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" variant="accent" className="w-full" disabled={pending}>
          {pending ? "Sende Link..." : "Reset-Link senden"}
        </Button>
        <p className="text-sm text-neutral-500">
          <Link href="/admin/login" className="font-medium text-accent hover:underline">
            Zurück zum Login
          </Link>
        </p>
      </form>
    </Form>
  );
}
