"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { track } from "@/lib/analytics/track";

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
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" }
  });

  async function onSubmit(values: FormValues) {
    setPending(true);
    // Conversion-Event: User hat aktiv den Magic-Link angefordert. Wir
    // tracken vor dem Netzwerk-Call, damit auch Resend-/Auth-Fehler im
    // Funnel sichtbar bleiben (signup_started ohne nachfolgendes
    // signup_completed = abgebrochener Mail-Versand oder kein Klick).
    if (mode === "signup") {
      track("signup_started", { method: "magic_link", ...(role ? { role } : {}) });
    }
    // Bug #10 Fix: useSearchParams() statt window.location.search — SSR-sicher,
    // reaktiv bei Route-Wechseln, kein Hydration-Mismatch-Risiko.
    const invitationToken = searchParams.get("invitation");
    // Reihenfolge: Invitation > expliziter Sponsor-Signup > Default-Signup > Login.
    // Sponsor-Signup MUSS auf /sponsor/onboarding gehen (Profil-Wizard) und
    // nicht auf /sponsor — sonst landet der User auf einem leeren Dashboard
    // ohne Sponsor-Profil und die Page redirected ihn potentiell hin und her.
    const callbackURL = invitationToken
      ? `/sponsor/onboarding?invitation=${invitationToken}`
      : mode === "signup"
        ? role === "sponsor"
          ? "/sponsor/onboarding"
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
