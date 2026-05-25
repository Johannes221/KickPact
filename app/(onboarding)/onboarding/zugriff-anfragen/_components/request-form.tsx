"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { requestClubAccessAction } from "../_actions/request";

const schema = z.object({
  requestedRole: z.enum(["admin", "trainer", "viewer"]),
  scope: z.enum(["club", "team"]),
  requestedTeamId: z.string().nullable(),
  message: z.string().max(280).optional(),
  isConflictClaim: z.boolean().default(false)
});
type FormValues = z.infer<typeof schema>;

export function RequestForm({
  clubSlug,
  clubName,
  teams
}: {
  clubSlug: string;
  clubName: string;
  teams: Array<{ id: string; name: string; saison: string }>;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const conflictFileRef = useRef<HTMLInputElement>(null);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      requestedRole: "trainer",
      scope: "club",
      requestedTeamId: null,
      message: "",
      isConflictClaim: false
    }
  });
  const scope = form.watch("scope");

  async function onSubmit(values: FormValues) {
    setPending(true);
    const fd = new FormData();
    fd.set("clubSlug", clubSlug);
    fd.set("requestedRole", values.requestedRole);
    if (values.scope === "team" && values.requestedTeamId) {
      fd.set("requestedTeamId", values.requestedTeamId);
    }
    if (values.message?.trim()) fd.set("message", values.message.trim());
    fd.set("isConflictClaim", String(values.isConflictClaim));
    if (values.isConflictClaim && conflictFileRef.current?.files?.[0]) {
      fd.set("conflictDoc", conflictFileRef.current.files[0]);
    }

    const res = await requestClubAccessAction(fd);
    setPending(false);

    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (res.alreadyMember) {
      toast.info("Du hast schon Zugriff — leite weiter.");
      router.push(`/verein/${res.clubSlug}`);
      return;
    }
    router.push(
      `/onboarding/zugriff-anfragen/gesendet?clubName=${encodeURIComponent(clubName)}${res.isConflictClaim ? "&conflict=1" : ""}`
    );
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="requestedRole"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>Welche Rolle?</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-2">
                      <Label className="flex items-center gap-3 rounded-lg border border-brand-neutral/40 bg-white p-3 cursor-pointer">
                        <RadioGroupItem value="admin" id="r-admin" />
                        <div>
                          <div className="font-semibold text-sm">Admin</div>
                          <div className="text-xs text-brand-night-navy/60">Vollzugriff inkl. Abo + Einstellungen</div>
                        </div>
                      </Label>
                      <Label className="flex items-center gap-3 rounded-lg border border-brand-neutral/40 bg-white p-3 cursor-pointer">
                        <RadioGroupItem value="trainer" id="r-trainer" />
                        <div>
                          <div className="font-semibold text-sm">Trainer</div>
                          <div className="text-xs text-brand-night-navy/60">Mannschaften + Events + Sponsoren</div>
                        </div>
                      </Label>
                      <Label className="flex items-center gap-3 rounded-lg border border-brand-neutral/40 bg-white p-3 cursor-pointer">
                        <RadioGroupItem value="viewer" id="r-viewer" />
                        <div>
                          <div className="font-semibold text-sm">Viewer</div>
                          <div className="text-xs text-brand-night-navy/60">Nur Lesen</div>
                        </div>
                      </Label>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="scope"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>Umfang</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-2">
                      <Label className="flex items-center gap-3 rounded-lg border border-brand-neutral/40 bg-white p-3 cursor-pointer">
                        <RadioGroupItem value="club" id="s-club" />
                        <div className="font-semibold text-sm">Ganzer Verein</div>
                      </Label>
                      <Label className="flex items-center gap-3 rounded-lg border border-brand-neutral/40 bg-white p-3 cursor-pointer">
                        <RadioGroupItem value="team" id="s-team" />
                        <div className="font-semibold text-sm">Nur eine Mannschaft</div>
                      </Label>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {scope === "team" && (
              <FormField
                control={form.control}
                name="requestedTeamId"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel>Welche Mannschaft?</FormLabel>
                    <FormControl>
                      <select
                        className="w-full rounded-md border border-brand-neutral/40 bg-white px-3 py-2 text-sm"
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || null)}
                      >
                        <option value="">— wählen —</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} · Saison {t.saison}
                          </option>
                        ))}
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>Nachricht an die Admins (optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="z.B. „Bin der neue Co-Trainer der C-Jugend ab nächster Saison“."
                      maxLength={280}
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <p className="text-xs text-brand-night-navy/40">Max. 280 Zeichen</p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-3">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={form.watch("isConflictClaim") ?? false}
                  onChange={(e) => form.setValue("isConflictClaim", e.target.checked)}
                />
                <span className="text-sm">
                  <strong>Ich bin der eigentliche Vereinsvertreter</strong> und der bestehende
                  Account ist eine Falschanmeldung.
                </span>
              </label>
              {form.watch("isConflictClaim") && (
                <div className="space-y-2 pt-2 border-t border-amber-200">
                  <p className="text-xs text-amber-900/80">
                    Lade eine Bescheinigung hoch (Vereinsregister-Auszug, Vorstandsbeschluss, …).
                    KickPact prüft beide Seiten und entscheidet anhand der stärkeren Beweisbasis.
                  </p>
                  <input
                    ref={conflictFileRef}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/heic,image/heif"
                    className="block w-full text-sm"
                  />
                </div>
              )}
            </div>

            <Button type="submit" variant="accent" disabled={pending} className="w-full">
              {pending ? "Sende Anfrage…" : "Anfrage senden"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
