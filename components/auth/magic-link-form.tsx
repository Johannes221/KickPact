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

const schema = z.object({ email: z.string().email("Bitte gültige E-Mail eingeben") });
type FormValues = z.infer<typeof schema>;

export type SignupRole = "mannschaft" | "verein" | "sponsor";

export function MagicLinkForm({
  mode,
  role
}: {
  mode: "login" | "signup";
  role?: SignupRole;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" }
  });

  async function onSubmit(values: FormValues) {
    setPending(true);
    const invitationToken =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("invitation")
        : null;
    // Reihenfolge: Invitation > expliziter Sponsor-Signup > Default-Signup > Login.
    const callbackURL = invitationToken
      ? `/sponsor/onboarding?invitation=${invitationToken}`
      : mode === "signup"
        ? role === "sponsor"
          ? "/sponsor"
          : "/onboarding/verein/1"
        : "/dashboard"; // rollenbasiert weiterleiten

    const result = await signIn.magicLink({
      email: values.email,
      callbackURL
    });
    setPending(false);
    if (result.error) {
      toast.error(result.error.message ?? "Konnte Link nicht senden");
      return;
    }
    router.push(`/verify?email=${encodeURIComponent(values.email)}`);
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
                <Input type="email" placeholder="du@beispiel.de" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" variant="accent" className="w-full" disabled={pending}>
          {pending ? "Sende Link..." : "Magic Link senden"}
        </Button>
      </form>
    </Form>
  );
}
