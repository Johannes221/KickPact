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
import { updateUserProfileAction } from "@/app/admin/(panel)/users/_actions/actions";

const schema = z.object({
  name: z.string().min(1, "Name erforderlich").max(120),
  email: z.string().email("Gültige E-Mail erforderlich")
});
type FormValues = z.infer<typeof schema>;

export function UserProfileEdit({
  userId,
  defaultName,
  defaultEmail
}: {
  userId: string;
  defaultName: string;
  defaultEmail: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: defaultName, email: defaultEmail }
  });

  async function onSubmit(values: FormValues) {
    setPending(true);
    const res = await updateUserProfileAction({ userId, ...values });
    setPending(false);
    if (res.ok) {
      toast.success("Profil gespeichert");
      router.refresh();
    } else {
      toast.error(res.error ?? "Speichern fehlgeschlagen");
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
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
                <Input type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" variant="accent" disabled={pending} className="sm:col-span-2 sm:w-fit">
          {pending ? "Speichern..." : "Profil speichern"}
        </Button>
      </form>
    </Form>
  );
}
