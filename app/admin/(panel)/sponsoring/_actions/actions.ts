"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { cancelChargeAsOperator } from "@/lib/db/queries/sponsoring-admin";
import { recordOperatorAction } from "@/lib/db/queries/operator-audit";

const schema = z.object({
  chargeId: z.string().min(1),
  reason: z.string().min(3, "Grund mind. 3 Zeichen").max(300)
});

export async function cancelChargeAction(input: { chargeId: string; reason: string }) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe" };
  }
  const { user: admin } = await assertPlatformAdmin();

  const ok = await cancelChargeAsOperator(parsed.data.chargeId, parsed.data.reason);
  if (!ok) {
    return { ok: false as const, error: "Charge nicht stornierbar (bereits storniert oder fakturiert)." };
  }

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "charge.cancel",
    targetType: "charge",
    targetId: parsed.data.chargeId,
    summary: `Charge storniert: ${parsed.data.reason}`,
    diff: { reason: parsed.data.reason }
  });

  revalidatePath("/admin/sponsoring");
  return { ok: true as const };
}
