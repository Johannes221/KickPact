"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const schema = z.object({
  email: z.string().email("Bitte gültige E-Mail eingeben"),
  password: z.string().min(1, "Passwort erforderlich")
});
type FormValues = z.infer<typeof schema>;

export function OperatorLoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" }
  });

  async function onSubmit(values: FormValues) {
    setPending(true);
    const result = await authClient.signIn.email({
      email: values.email,
      password: values.password,
      callbackURL: "/admin/dashboard"
    });
    setPending(false);
    if (result.error) {
      // Bewusst generische Meldung — kein Hinweis, ob E-Mail existiert.
      toast.error("Login fehlgeschlagen. E-Mail oder Passwort falsch.");
      return;
    }
    router.push("/admin/dashboard");
    router.refresh();
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
                <Input type="email" placeholder="operator@kickpact.com" autoComplete="username" {...field} />
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
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" variant="accent" className="w-full" disabled={pending}>
          {pending ? "Anmelden..." : "Anmelden"}
        </Button>
        <p className="text-sm text-neutral-500">
          <Link href="/admin/forgot-password" className="font-medium text-accent hover:underline">
            Passwort vergessen?
          </Link>
        </p>
      </form>
    </Form>
  );
}
