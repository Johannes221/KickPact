"use server";

import { z } from "zod";
import { getServerSession } from "@/lib/auth/session";
import { createSupportTicket } from "@/lib/db/queries/support";

const schema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  category: z.enum(["frage", "bug", "abrechnung", "sonstiges"]),
  subject: z.string().min(3).max(150),
  message: z.string().min(10).max(5000)
});

export async function submitSupportTicket(input: z.infer<typeof schema>) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Bitte fülle alle Felder korrekt aus." };
  }

  // Wenn eingeloggt: Ticket dem Account zuordnen (für Operator-Kontext).
  const session = await getServerSession();

  try {
    await createSupportTicket({
      ...parsed.data,
      userId: session?.user?.id ?? null
    });
  } catch (err) {
    console.error("[support] createSupportTicket failed", err);
    return { ok: false as const, error: "Senden fehlgeschlagen. Bitte später erneut versuchen." };
  }

  return { ok: true as const };
}
