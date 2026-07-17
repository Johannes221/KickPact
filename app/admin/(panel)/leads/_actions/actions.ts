"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { setSponsorLeadHandled } from "@/lib/db/queries/sponsor-leads-admin";
import { recordOperatorAction } from "@/lib/db/queries/operator-audit";

const schema = z.object({
  leadId: z.string().min(1),
  handled: z.boolean()
});

export async function setLeadHandledAction(input: {
  leadId: string;
  handled: boolean;
}) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  const { user: admin } = await assertPlatformAdmin();

  const lead = await setSponsorLeadHandled(parsed.data.leadId, parsed.data.handled);
  if (!lead) {
    return {
      ok: false as const,
      error: "Lead nicht gefunden — evtl. von der Retention gelöscht (180 Tage)."
    };
  }

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: parsed.data.handled ? "lead.handled" : "lead.reopened",
    targetType: "sponsor_lead",
    targetId: lead.id,
    summary: parsed.data.handled
      ? "Sponsor-Lead als bearbeitet markiert"
      : "Sponsor-Lead wieder geöffnet",
    diff: { handledAt: lead.handledAt }
  });

  revalidatePath("/admin/leads");
  return { ok: true as const, handled: lead.handledAt !== null };
}
