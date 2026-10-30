import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  charges,
  clubs,
  subscriptions,
  teamLicenses,
  teams,
  users
} from "@/lib/db/schema";
import { chargeCountsTowardCap } from "@/lib/db/queries/evaluation";
import { getPlatformKpis } from "@/lib/db/queries/platform-stats";

/**
 * Tägliches Morgen-Briefing: Plattform-Überblick für die Operatoren.
 *
 *  - `neu`: alles, was im 24-h-Fenster (jetzt − 24 h) NEU dazugekommen ist —
 *    Nutzer, Vereine, Mannschaften, Abos (i.d.R. Trial-Starts), neu aktivierte
 *    (bezahlte) Team-Lizenzen und generierte Beiträge (Charges, gleiche
 *    Money-Filter-Logik wie Cap/Rechnung via `chargeCountsTowardCap`).
 *  - `bestand`: aktuelle Gesamtzahlen; MRR/Conversion/Churn kommen aus
 *    `getPlatformKpis` (Single Source of Truth fürs Dashboard), damit das
 *    Briefing nie von den Admin-Kacheln abweicht.
 */
export interface MorningBriefingData {
  windowStart: Date;
  windowEnd: Date;
  neu: {
    users: number;
    clubs: number;
    teams: number;
    subscriptions: number;
    activatedLicenses: number;
    chargesCount: number;
    chargesCents: number;
  };
  bestand: {
    users: number;
    clubs: number;
    activeTeams: number;
    activeSubscriptions: number;
    trialingSubscriptions: number;
    mrrCents: number;
    trialToPaidPercent: number;
    churnPercent: number;
  };
}

async function countStar(query: Promise<Array<{ c: number }>>): Promise<number> {
  const rows = await query;
  return Number(rows[0]?.c ?? 0);
}

export async function getMorningBriefingData(): Promise<MorningBriefingData> {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - 24 * 60 * 60 * 1000);
  const c = sql<number>`count(*)::int`;

  const [
    newUsers,
    newClubs,
    newTeams,
    newSubs,
    newLicenses,
    chargeAgg,
    totalUsers,
    totalClubs,
    activeTeams,
    trialingSubs,
    kpis
  ] = await Promise.all([
    countStar(db.select({ c }).from(users).where(gte(users.createdAt, windowStart))),
    countStar(db.select({ c }).from(clubs).where(gte(clubs.createdAt, windowStart))),
    countStar(db.select({ c }).from(teams).where(gte(teams.createdAt, windowStart))),
    countStar(
      db.select({ c }).from(subscriptions).where(gte(subscriptions.createdAt, windowStart))
    ),
    countStar(
      db
        .select({ c })
        .from(teamLicenses)
        .where(
          and(eq(teamLicenses.status, "active"), gte(teamLicenses.activatedAt, windowStart))
        )
    ),
    db
      .select({
        c,
        cents: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`
      })
      .from(charges)
      .where(chargeCountsTowardCap(windowStart, windowEnd)),
    countStar(db.select({ c }).from(users)),
    countStar(db.select({ c }).from(clubs)),
    countStar(db.select({ c }).from(teams).where(eq(teams.isActive, true))),
    countStar(
      db.select({ c }).from(subscriptions).where(eq(subscriptions.status, "trialing"))
    ),
    getPlatformKpis()
  ]);

  return {
    windowStart,
    windowEnd,
    neu: {
      users: newUsers,
      clubs: newClubs,
      teams: newTeams,
      subscriptions: newSubs,
      activatedLicenses: newLicenses,
      chargesCount: Number(chargeAgg[0]?.c ?? 0),
      chargesCents: Number(chargeAgg[0]?.cents ?? 0)
    },
    bestand: {
      users: totalUsers,
      clubs: totalClubs,
      activeTeams,
      activeSubscriptions: kpis.activeClubs,
      trialingSubscriptions: trialingSubs,
      mrrCents: kpis.mrrCents,
      trialToPaidPercent: kpis.trialToPaidPercent,
      churnPercent: kpis.churnPercent
    }
  };
}
