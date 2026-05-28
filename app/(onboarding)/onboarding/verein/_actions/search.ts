"use server";

import { z } from "zod";
import { inArray } from "drizzle-orm";
import { searchVereine, getMannschaften } from "@/lib/crawler/fussballde";
import { db } from "@/lib/db/client";
import { clubs } from "@/lib/db/schema";

const searchSchema = z.object({
  query: z.string().min(2).max(80)
});

export async function searchVereineAction(input: { query: string }) {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Bitte mindestens 2 Zeichen eingeben" };
  }
  try {
    const hits = await searchVereine(parsed.data.query);
    const limited = hits.slice(0, 15);

    // Mark hits whose fußball.de-Verein-ID already exists in our DB.
    const fussballdeIds = limited.map((h) => h.vereinId);
    const claimed =
      fussballdeIds.length === 0
        ? []
        : await db
            .select({ slug: clubs.slug, fussballdeVereinId: clubs.fussballdeVereinId })
            .from(clubs)
            .where(inArray(clubs.fussballdeVereinId, fussballdeIds));
    const claimedMap = new Map(
      claimed
        .filter((c): c is { slug: string; fussballdeVereinId: string } => c.fussballdeVereinId !== null)
        .map((c) => [c.fussballdeVereinId, c.slug])
    );

    const enriched = limited.map((h) => ({
      ...h,
      isAlreadyClaimed: claimedMap.has(h.vereinId),
      claimedClubSlug: claimedMap.get(h.vereinId) ?? null
    }));

    return { ok: true as const, results: enriched };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Suche fehlgeschlagen"
    };
  }
}

export async function getMannschaftenAction(input: {
  vereinId: string;
  slug: string;
  vereinName?: string;
}) {
  try {
    const results = await getMannschaften(input.vereinId, input.slug, input.vereinName);
    return { ok: true as const, results };
  } catch (e) {
    return {
      ok: false as const,
      error: e instanceof Error ? e.message : "Mannschaften laden fehlgeschlagen"
    };
  }
}
