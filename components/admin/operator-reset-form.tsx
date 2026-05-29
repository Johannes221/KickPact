"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const schema = z
  .object({
    password: z.string().min(12, "Mindestens 12 Zeichen"),
    confirm: z.string()
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwörter stimmen nicht überein",
    path: ["confirm"]
  });
type FormValues = z.infer<typeof schema>;

export function OperatorResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [pending, setPending] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirm: "" }
  });

  if (!token) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-neutral-600">
          Der Reset-Link ist ungültig oder abgelaufen. Fordere einen neuen an.
        </p>
        <Link href="/admin/forgot-password" className="text-sm font-medium text-accent hover:underline">
          Neuen Link anfordern
        </Link>
      </div>
    );
  }

  async function onSubmit(values: FormValues) {
    setPending(true);
    const result = await authClient.resetPassword({
      newPassword: values.password,
      token: token as string
    });
    setPending(false);
    if (result.error) {
      toast.error("Zurücksetzen fehlgeschlagen. Link evtl. abgelaufen.");
      return;
    }
    toast.success("Passwort gesetzt. Du kannst dich jetzt anmelden.");
    router.push("/admin/login");
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Neues Passwort</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Passwort bestätigen</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" variant="accent" className="w-full" disabled={pending}>
          {pending ? "Speichere..." : "Passwort setzen"}
        </Button>
      </form>
    </Form>
  );
}
