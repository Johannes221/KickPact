"use server";

import { z } from "zod";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { inngest } from "@/lib/inngest/client";

const inputSchema = z.object({
  period: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Format muss YYYY-MM sein")
    .optional()
});

/**
 * Triggert manuell die Rechnungsgenerierung für einen bestimmten Zeitraum.
 * Fires `invoices/manual-run` (siehe lib/inngest/functions/generate-invoices.ts L91)
 * — period optional; ohne Angabe = letzter Monat (wie der Cron-Job).
 */
export async function triggerManualInvoiceAction(input: { period?: string }) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe" };
  }
  await assertPlatformAdmin();

  try {
    await inngest.send({
      name: "invoices/manual-run",
      data: parsed.data.period ? { period: parsed.data.period } : {}
    });
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Inngest-Event fehlgeschlagen"
    };
  }

  return { ok: true as const };
}
