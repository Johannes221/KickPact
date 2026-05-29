"use server";

import { z } from "zod";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { renderTemplatePreviews } from "@/lib/mail/preview";
import { recordOperatorAction } from "@/lib/db/queries/operator-audit";
import { resend, MAIL_FROM } from "@/lib/mail/client";

const schema = z.object({
  templateKey: z.string().min(1),
  to: z.string().email("Gültige E-Mail erforderlich")
});

export async function sendTestMailAction(input: { templateKey: string; to: string }) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.errors[0]?.message ?? "Ungültige Eingabe" };
  }
  const { user: admin } = await assertPlatformAdmin();

  const tpl = renderTemplatePreviews().find((t) => t.key === parsed.data.templateKey);
  if (!tpl) return { ok: false as const, error: "Template nicht gefunden" };

  const result = await resend.emails.send({
    from: MAIL_FROM,
    to: parsed.data.to,
    subject: `[TEST] ${tpl.subject}`,
    html: tpl.html,
    text: tpl.text
  });
  if (result.error) {
    return { ok: false as const, error: "Versand fehlgeschlagen." };
  }

  await recordOperatorAction({
    operatorUserId: admin.id,
    action: "mail.test_send",
    targetType: "support",
    targetId: null,
    summary: `Test-Mail '${tpl.key}' an ${parsed.data.to} gesendet`
  });

  return { ok: true as const };
}
