"use server";

import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { searchVereine, getMannschaften } from "@/lib/crawler/fussballde";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { teamLicenses } from "@/lib/db/schema/billing";

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

    // Ein Treffer gilt nur dann als "schon vergeben" (→ Zugriff anfragen), wenn
    // der Verein eine AKTIVE VEREINSLIZENZ hat (teamLicenses.plan = 'verein').
    // Ein nur namensgebend angelegter Club (Mannschaften mit eigenen basic/pro-
    // Lizenzen) blockt NICHT — dort kann man eine weitere Mannschaft frei
    // onboarden; Konflikte auf Team-Ebene werden separat behandelt.
    const fussballdeIds = limited.map((h) => h.vereinId);
    const claimed =
      fussballdeIds.length === 0
        ? []
        : await db
            .selectDistinct({
              slug: clubs.slug,
              fussballdeVereinId: clubs.fussballdeVereinId
            })
            .from(clubs)
            .innerJoin(teams, eq(teams.clubId, clubs.id))
            .innerJoin(teamLicenses, eq(teamLicenses.teamId, teams.id))
            .where(
              and(
                inArray(clubs.fussballdeVereinId, fussballdeIds),
                eq(teamLicenses.plan, "verein")
              )
            );
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
