"use server";

import { z } from "zod";
import { searchVereine, getMannschaften } from "@/lib/crawler/fussballde";

const searchSchema = z.object({
  query: z.string().min(2).max(80)
});

export async function searchVereineAction(input: { query: string }) {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: "Bitte mindestens 2 Zeichen eingeben" };
  }
  try {
    const results = await searchVereine(parsed.data.query);
    return { ok: true as const, results: results.slice(0, 15) };
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
