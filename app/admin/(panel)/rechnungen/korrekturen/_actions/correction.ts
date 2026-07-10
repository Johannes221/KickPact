"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { createCorrectionInvoice } from "@/lib/invoicing/storno";
import { dismissChargeCorrections } from "@/lib/db/queries/charges";
import { recordOperatorAction } from "@/lib/db/queries/operator-audit";
import { eur } from "@/lib/utils/currency";

const CORRECTION_REASONS: Record<string, string> = {
  not_found: "Rechnung nicht gefunden.",
  already_cancelled: "Rechnung ist bereits (voll) storniert.",
  is_storno: "Ein Korrekturbeleg kann nicht erneut korrigiert werden.",
  wrong_status:
    "Nur versendete oder bezahlte Rechnungen können teil-gutgeschrieben werden — sonst verwerfen.",
  no_pdf: "Zur Rechnung fehlt das PDF/die Nummer — Gutschrift nicht möglich.",
  no_charges: "Keine passenden offenen Charges für die Gutschrift.",
  legacy_ust_partial:
    "Alt-Beleg mit ausgewiesener USt — bitte vollständig stornieren statt teil-gutzuschreiben (sonst wird der USt-Anteil nicht mit-erstattet)."
};

const correctionSchema = z.object({
  invoiceId: z.string().min(1),
  chargeIds: z.array(z.string().min(1)).min(1)
});

export async function createCorrectionAction(input: {
  invoiceId: string;
  chargeIds: string[];
}) {
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  let result;
  try {
    result = await createCorrectionInvoice(parsed.data.invoiceId, parsed.data.chargeIds);
  } catch (e) {
    console.error("[correction] credit-note failed", e);
    return { ok: false as const, error: "Fehler beim Erzeugen der Gutschrift." };
  }
  if (!result.ok) {
    return {
      ok: false as const,
      error: CORRECTION_REASONS[result.reason] ?? "Gutschrift nicht möglich."
    };
  }

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "invoice.correction",
    targetType: "invoice",
    targetId: parsed.data.invoiceId,
    summary: `Korrektur-Gutschrift ${result.stornoNumber} erzeugt (${eur(result.amountCents)}, ${parsed.data.chargeIds.length} Charge(s))`,
    diff: {
      stornoInvoiceId: result.stornoInvoiceId,
      stornoNumber: result.stornoNumber,
      chargeIds: parsed.data.chargeIds
    }
  });

  revalidatePath("/admin/rechnungen/korrekturen");
  return { ok: true as const, stornoNumber: result.stornoNumber };
}

const dismissSchema = z.object({ chargeIds: z.array(z.string().min(1)).min(1) });

export async function dismissCorrectionAction(input: { chargeIds: string[] }) {
  const parsed = dismissSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  const dismissed = await dismissChargeCorrections(parsed.data.chargeIds);
  if (dismissed === 0) {
    return { ok: false as const, error: "Nichts zu verwerfen (bereits bearbeitet)." };
  }

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "invoice.correction_dismiss",
    targetType: "charge",
    targetId: parsed.data.chargeIds[0] ?? null,
    summary: `Korrektur-Markierung verworfen (${dismissed} Charge(s), kein Scrape-Fehler)`,
    diff: { chargeIds: parsed.data.chargeIds }
  });

  revalidatePath("/admin/rechnungen/korrekturen");
  return { ok: true as const, dismissed };
}
