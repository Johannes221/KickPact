import { and, eq, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { matches, matchEvents, teams, clubs } from "@/lib/db/schema";
import { charges, charges as chargesTable } from "@/lib/db/schema/charges";
import { pledges, pledgeRules } from "@/lib/db/schema/pledges";
import { sponsors } from "@/lib/db/schema/sponsors";
import { users } from "@/lib/db/schema/auth";
import { TRIGGER_META } from "@/lib/triggers/labels";

export async function getMatchById(matchId: string, clubSlug: string) {
  const [row] = await db
    .select({
      match: matches,
      team: teams,
      club: clubs
    })
    .from(matches)
    .innerJoin(teams, eq(matches.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(and(eq(matches.id, matchId), eq(clubs.slug, clubSlug)))
    .limit(1);
  return row ?? null;
}

export async function listMatchEvents(matchId: string) {
  return db
    .select()
    .from(matchEvents)
    .where(eq(matchEvents.matchId, matchId))
    .orderBy(matchEvents.minute);
}

export async function listMatchesForTeam(teamId: string, limit = 20) {
  return db
    .select()
    .from(matches)
    .where(eq(matches.teamId, teamId))
    .orderBy(desc(matches.datum))
    .limit(limit);
}

/** Liefert Charges-Summe pro Match für eine Mannschaft (für die Match-Liste). */
export async function getMatchChargesSummaryForTeam(
  teamId: string
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      matchId: charges.matchId,
      total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`
    })
    .from(charges)
    .innerJoin(pledges, eq(charges.pledgeId, pledges.id))
    .where(and(eq(pledges.teamId, teamId), sql`${charges.matchId} IS NOT NULL`))
    .groupBy(charges.matchId);

  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.matchId) map.set(r.matchId, Number(r.total));
  }
  return map;
}

export interface MatchChargeRow {
  chargeId: string;
  triggerType: string;
  amountCents: number;
  status: string;
  matchEventId: string | null;
  sponsorDisplayName: string;
  pledgeId: string;
}

export interface MatchChargesData {
  rows: MatchChargeRow[];
  totalCents: number;
  /** Pro Trigger-Typ aggregiert */
  byTrigger: Array<{
    triggerType: string;
    label: string;
    emoji: string;
    count: number;
    totalCents: number;
  }>;
  /** Pro Sponsor aggregiert */
  bySponsor: Array<{
    sponsorDisplayName: string;
    totalCents: number;
    triggerSummary: string;
  }>;
}

export async function listMatchCharges(matchId: string): Promise<MatchChargesData> {
  const rows = await db
    .select({
      chargeId: chargesTable.id,
      triggerType: chargesTable.triggerType,
      amountCents: chargesTable.amountCents,
      status: chargesTable.status,
      matchEventId: chargesTable.matchEventId,
      sponsorDisplayName: sponsors.displayName,
      pledgeId: chargesTable.pledgeId
    })
    .from(chargesTable)
    .innerJoin(pledges, eq(chargesTable.pledgeId, pledges.id))
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .where(eq(chargesTable.matchId, matchId))
    .orderBy(chargesTable.triggerType);

  const totalCents = rows.reduce((s, r) => s + r.amountCents, 0);

  // Gruppierung nach Trigger
  const triggerMap = new Map<string, { count: number; total: number }>();
  for (const r of rows) {
    const existing = triggerMap.get(r.triggerType) ?? { count: 0, total: 0 };
    triggerMap.set(r.triggerType, {
      count: existing.count + 1,
      total: existing.total + r.amountCents
    });
  }
  const byTrigger = [...triggerMap.entries()].map(([tt, v]) => {
    const meta = (TRIGGER_META as Record<string, { label: string; emoji: string } | undefined>)[tt];
    return {
      triggerType: tt,
      label: meta?.label ?? tt,
      emoji: meta?.emoji ?? "💚",
      count: v.count,
      totalCents: v.total
    };
  });

  // Gruppierung nach Sponsor
  const sponsorMap = new Map<string, { total: number; triggers: Set<string> }>();
  for (const r of rows) {
    const existing = sponsorMap.get(r.sponsorDisplayName) ?? { total: 0, triggers: new Set() };
    existing.total += r.amountCents;
    const meta = (TRIGGER_META as Record<string, { label: string; emoji: string } | undefined>)[
      r.triggerType
    ];
    existing.triggers.add(`${meta?.emoji ?? "💚"} ${meta?.label ?? r.triggerType}`);
    sponsorMap.set(r.sponsorDisplayName, existing);
  }
  const bySponsor = [...sponsorMap.entries()].map(([name, v]) => ({
    sponsorDisplayName: name,
    totalCents: v.total,
    triggerSummary: [...v.triggers].join(", ")
  }));

  return { rows, totalCents, byTrigger, bySponsor };
}
