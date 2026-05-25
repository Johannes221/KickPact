"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertPlatformAdmin } from "@/lib/auth/admin";
import { inngest } from "@/lib/inngest/client";

const inputSchema = z.object({ teamId: z.string().min(1) });

/**
 * Triggert manuell den Crawler für ein einzelnes Team.
 * Fires `crawler/team.crawl` (siehe lib/inngest/functions/crawl-matches.ts L27)
 * — die crawl-matches-Function picks up beide Events (manual + team.crawl).
 */
export async function triggerManualCrawlAction(input: { teamId: string }) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Ungültige Eingabe" };
  await assertPlatformAdmin();

  try {
    await inngest.send({
      name: "crawler/team.crawl",
      data: { teamId: parsed.data.teamId }
    });
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Inngest-Event fehlgeschlagen"
    };
  }

  revalidatePath("/admin/crawler");
  return { ok: true as const };
}
