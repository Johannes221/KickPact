"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { updateClubAction } from "@/app/admin/(panel)/vereine/_actions/club-actions";

const schema = z.object({
  name: z.string().min(1, "Name erforderlich").max(200),
  ort: z.string().max(200).optional(),
  iban: z.string().max(40).optional(),
  taxId: z.string().max(40).optional()
});
type FormValues = z.infer<typeof schema>;

export function ClubEditForm({
  clubSlug,
  defaults
}: {
  clubSlug: string;
  defaults: { name: string; ort: string; iban: string; taxId: string };
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });

  async function onSubmit(values: FormValues) {
    setPending(true);
    const res = await updateClubAction({ clubSlug, ...values });
    setPending(false);
    if (res.ok) {
      toast.success("Stammdaten gespeichert");
      router.refresh();
    } else {
      toast.error(res.error ?? "Speichern fehlgeschlagen");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem className="sm:col-span-2">
              <FormLabel>Vereinsname</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="ort"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ort</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="iban"
          render={({ field }) => (
            <FormItem>
              <FormLabel>IBAN</FormLabel>
              <FormControl>
                <Input className="font-mono" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="taxId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Steuernummer / USt-IdNr.</FormLabel>
              <FormControl>
                <Input className="font-mono" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" variant="accent" disabled={pending} className="sm:col-span-2 sm:w-fit">
          {pending ? "Speichern..." : "Stammdaten speichern"}
        </Button>
      </form>
    </Form>
  );
}
