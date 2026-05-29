"use server";

import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { searchVereine, getMannschaften } from "@/lib/crawler/fussballde";
import { db } from "@/lib/db/client";
import { clubs, clubMemberships } from "@/lib/db/schema";
import { getServerSession } from "@/lib/auth/session";

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

    // Einen Verein nur dann als „belegt" markieren, wenn ein **fertig
    // onboardeter** Club (onboardingStatus = 'completed') mit dieser fußball.de-
    // Verein-ID existiert, der NICHT dem aktuellen User gehört. Sonst würde der
    // eigene halbfertige Draft (oder ein fremder Draft) fälschlich als „Schon
    // registriert → Zugriff anfragen" angezeigt — der User soll seinen eigenen
    // Draft per Resume fortsetzen können, nicht bei sich selbst Zugriff anfragen.
    const session = await getServerSession();
    const currentUserId = session?.user?.id ?? null;

    const fussballdeIds = limited.map((h) => h.vereinId);
    const existing =
      fussballdeIds.length === 0
        ? []
        : await db
            .select({
              id: clubs.id,
              slug: clubs.slug,
              fussballdeVereinId: clubs.fussballdeVereinId,
              onboardingStatus: clubs.onboardingStatus
            })
            .from(clubs)
            .where(inArray(clubs.fussballdeVereinId, fussballdeIds));

    // Welche dieser Clubs gehören dem aktuellen User? (für Owner-Ausnahme)
    const myClubIds = new Set<string>();
    if (currentUserId && existing.length > 0) {
      const myMems = await db
        .select({ clubId: clubMemberships.clubId })
        .from(clubMemberships)
        .where(
          and(
            eq(clubMemberships.userId, currentUserId),
            inArray(
              clubMemberships.clubId,
              existing.map((c) => c.id)
            )
          )
        );
      for (const m of myMems) myClubIds.add(m.clubId);
    }

    const claimedMap = new Map<string, string>();
    for (const c of existing) {
      if (!c.fussballdeVereinId) continue;
      const isCompleted = c.onboardingStatus === "completed";
      const ownedByMe = myClubIds.has(c.id);
      if (isCompleted && !ownedByMe) {
        claimedMap.set(c.fussballdeVereinId, c.slug);
      }
    }

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
