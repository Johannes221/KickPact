import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
  sql,
  type SQL
} from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  charges,
  clubs,
  clubMemberships,
  pledges,
  pledgeRules,
  sponsors,
  subscriptions,
  teamLicenses,
  teams,
  users
} from "@/lib/db/schema";
import {
  countStar,
  paginate,
  type PaginatedResult
} from "@/lib/db/queries/_helpers/paginate";
import { chargeCountsTowardCap, utcMonthWindow } from "@/lib/db/queries/evaluation";
import {
  CYCLE_ORDER,
  PLAN_ORDER,
  getMonthlyEquivalent
} from "@/lib/stripe/pricing";

/**
 * Platform-Admin Statistics.
 *
 * KPI-aggregations used by the /admin/dashboard tiles + drill-downs:
 *  - Active clubs (subscriptions.status='active')
 *  - MRR (sum of monthly-equivalent active subs; uses static price-map below
 *    instead of joining Stripe — those Stripe IDs change rarely and we keep
 *    pricing in code anyway, see lib/stripe/pricing.ts).
 *  - Trial→Paid conversion (last 30d).
 *  - Churn (canceled last 30d / active 30d ago).
 *  - Avg €/pledge (avg(pledge_rules.amountCents) over active pledges).
 *  - Top-5 trigger types by charge-count.
 *  - MRR over 6 months (for the dashboard mini-chart).
 *
 * Plus paginated listings:
 *  - listVereineForAdmin — filter/search across clubs+subscriptions for /admin/vereine.
 *  - listUsersForAdmin   — filter/search across users + sponsor/membership/pledge presence.
 */

/**
 * Plan + Cycle → monthly-equivalent in cents. Derived directly from the
 * pricing source of truth (lib/stripe/pricing.ts) so MRR-Zahlen nie von der
 * Preis-Tabelle abweichen können. Lookup by string with `?? 0`-Fallback fängt
 * Alt-Bestände (z.B. inerter Enum-Wert 'annual') ab.
 */
const PLAN_CYCLE_MONTHLY_CENTS: Record<string, Record<string, number>> =
  Object.fromEntries(
    PLAN_ORDER.map((plan) => [
      plan,
      Object.fromEntries(
        CYCLE_ORDER.map((cycle) => [cycle, getMonthlyEquivalent(plan, cycle)])
      )
    ])
  );

export interface PlatformKpis {
  activeClubs: number;
  mrrCents: number;
  trialToPaidPercent: number;
  churnPercent: number;
  avgPledgeAmountCents: number;
  topTrigger: { triggerType: string; chargeCount: number } | null;
  /** MRR series in chronological order, oldest first. 6 entries. */
  mrrSeries: Array<{ monthLabel: string; mrrCents: number }>;
}

/**
 * Top-level dashboard KPIs.
 *
 * Notes on implementation choices:
 *  - We use the Drizzle builder API (not raw `db.execute(sql\`\`)`) for queries
 *    that bind `Date` parameters. The postgres-js driver rejects Date in
 *    template-literal positions, but it accepts them transparently when
 *    Drizzle types the column.
 *  - MRR is computed client-side from (teamLicenses.plan, subscriptions.billingCycle)
 *    using the price-map above instead of doing the multiplication in SQL —
 *    keeps the SQL simple and the pricing-source authoritative.
 */
export async function getPlatformKpis(): Promise<PlatformKpis> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // --- Active clubs ---
  const activeClubsRows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(subscriptions)
    .where(eq(subscriptions.status, "active"));
  const activeClubs = Number(activeClubsRows[0]?.c ?? 0);

  // --- MRR ---
  const licenseRows = await db
    .select({
      plan: teamLicenses.plan,
      cycle: subscriptions.billingCycle
    })
    .from(teamLicenses)
    .innerJoin(subscriptions, eq(teamLicenses.subscriptionClubId, subscriptions.clubId))
    .where(eq(subscriptions.status, "active"));

  let mrrCents = 0;
  for (const row of licenseRows) {
    const monthly = PLAN_CYCLE_MONTHLY_CENTS[row.plan]?.[row.cycle] ?? 0;
    mrrCents += monthly;
  }

  // --- Trial→Paid conversion (last 30d) ---
  // Eligible = trials that ended in the last 30d
  // Converted = of those, the subset that's now active.
  const trialEligibleRows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(subscriptions)
    .where(
      and(
        isNotNull(subscriptions.trialEndsAt),
        gte(subscriptions.trialEndsAt, thirtyDaysAgo),
        lt(subscriptions.trialEndsAt, now)
      )
    );
  const trialConvertedRows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "active"),
        isNotNull(subscriptions.trialEndsAt),
        gte(subscriptions.trialEndsAt, thirtyDaysAgo),
        lt(subscriptions.trialEndsAt, now)
      )
    );
  const eligible = Number(trialEligibleRows[0]?.c ?? 0);
  const converted = Number(trialConvertedRows[0]?.c ?? 0);
  const trialToPaidPercent =
    eligible > 0 ? Math.round((converted / eligible) * 100) : 0;

  // --- Churn (last 30d) ---
  const churnedRows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "cancelled"),
        gte(subscriptions.updatedAt, thirtyDaysAgo)
      )
    );
  const baselineRows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(subscriptions)
    .where(
      and(
        lt(subscriptions.createdAt, thirtyDaysAgo),
        inArray(subscriptions.status, ["active", "past_due", "paused"])
      )
    );
  const canceled = Number(churnedRows[0]?.c ?? 0);
  const baseline = Number(baselineRows[0]?.c ?? 0);
  const churnPercent = baseline > 0 ? Math.round((canceled / baseline) * 100) : 0;

  // --- Avg €/pledge ---
  const avgRows = await db
    .select({ avg: sql<number>`COALESCE(AVG(${pledgeRules.amountCents}), 0)::int` })
    .from(pledgeRules)
    .innerJoin(pledges, eq(pledges.id, pledgeRules.pledgeId))
    .where(eq(pledges.status, "active"));
  const avgPledgeAmountCents = Number(avgRows[0]?.avg ?? 0);

  // --- Top-5 triggers by charge-count ---
  const topTriggers = await db
    .select({
      triggerType: charges.triggerType,
      chargeCount: sql<number>`count(*)::int`.as("charge_count")
    })
    .from(charges)
    .where(ne(charges.status, "cancelled"))
    .groupBy(charges.triggerType)
    .orderBy(desc(sql`count(*)`))
    .limit(5);

  const topTrigger = topTriggers[0]
    ? { triggerType: topTriggers[0].triggerType, chargeCount: Number(topTriggers[0].chargeCount) }
    : null;

  // --- MRR series (6 months, snapshot approx via team_licenses.activatedAt window) ---
  const mrrSeries: Array<{ monthLabel: string; mrrCents: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const dtEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const rows = await db
      .select({
        plan: teamLicenses.plan,
        cycle: subscriptions.billingCycle
      })
      .from(teamLicenses)
      .innerJoin(subscriptions, eq(subscriptions.clubId, teamLicenses.subscriptionClubId))
      .where(
        and(
          lt(teamLicenses.activatedAt, dtEnd),
          or(
            isNull(teamLicenses.deactivatedAt),
            gt(teamLicenses.deactivatedAt, dt)
          ),
          inArray(subscriptions.status, ["active", "past_due", "paused"])
        )
      );
    let monthCents = 0;
    for (const r of rows) {
      monthCents += PLAN_CYCLE_MONTHLY_CENTS[r.plan]?.[r.cycle] ?? 0;
    }
    mrrSeries.push({
      monthLabel: dt.toLocaleDateString("de-DE", { month: "short", year: "2-digit" }),
      mrrCents: monthCents
    });
  }

  return {
    activeClubs,
    mrrCents,
    trialToPaidPercent,
    churnPercent,
    avgPledgeAmountCents,
    topTrigger,
    mrrSeries
  };
}

/**
 * Top-N clubs by charge total in the current month — used by the dashboard
 * "Top-Vereine"-Liste.
 */
export interface TopClubRow {
  clubId: string;
  clubName: string;
  clubSlug: string;
  totalCents: number;
  chargeCount: number;
}

export async function getTopClubsThisMonth(limit = 5): Promise<TopClubRow[]> {
  return getTopClubsForMonth(currentMonthStr(), limit);
}

/** "YYYY-MM" des aktuellen Monats (lokale Zeit). */
export function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Top-N Vereine nach Charge-Summe in einem bestimmten Monat ("YYYY-MM").
 * Ungültiges Format fällt auf den aktuellen Monat zurück.
 */
export async function getTopClubsForMonth(month: string, limit = 5): Promise<TopClubRow[]> {
  const m = /^\d{4}-\d{2}$/.test(month) ? month : currentMonthStr();
  const [y, mo] = m.split("-").map((n) => parseInt(n, 10));
  // UTC-Fenster + COALESCE(confirmedAt, createdAt) + CAP_COUNTED_STATUSES: die
  // Rangliste zählt exakt dieselbe Menge wie Cap-Enforcement und Rechnung.
  // Vorher lokale Monatsgrenzen (Server-TZ ≠ UTC verschob den Monatsrand) und
  // `!= cancelled` — damit lag unbestätigtes pending_approval-Geld in der Liste.
  const { start: monthStart, end: monthEnd } = utcMonthWindow(new Date(Date.UTC(y, mo - 1, 1)));

  const rows = await db
    .select({
      clubId: clubs.id,
      clubName: clubs.name,
      clubSlug: clubs.slug,
      totalCents: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`.as("total_cents"),
      chargeCount: sql<number>`COUNT(*)::int`.as("charge_count")
    })
    .from(charges)
    .innerJoin(pledges, eq(pledges.id, charges.pledgeId))
    .innerJoin(teams, eq(teams.id, pledges.teamId))
    .innerJoin(clubs, eq(clubs.id, teams.clubId))
    .where(chargeCountsTowardCap(monthStart, monthEnd))
    .groupBy(clubs.id, clubs.name, clubs.slug)
    .orderBy(desc(sql`SUM(${charges.amountCents})`))
    .limit(limit);

  return rows.map((r) => ({
    clubId: r.clubId,
    clubName: r.clubName,
    clubSlug: r.clubSlug,
    totalCents: Number(r.totalCents),
    chargeCount: Number(r.chargeCount)
  }));
}

// ---------------------------------------------------------------------------
// /admin/vereine list
// ---------------------------------------------------------------------------

export const ADMIN_VEREIN_SORT_KEYS = [
  "name",
  "ort",
  "createdAt",
  "status"
] as const;
export type AdminVereinSortKey = (typeof ADMIN_VEREIN_SORT_KEYS)[number];

export interface AdminVereinRow {
  id: string;
  slug: string;
  name: string;
  ort: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  subscriptionStatus: string | null;
  billingCycle: string | null;
  teamCount: number;
  memberCount: number;
  sponsorCount: number;
  topPlan: string | null;
}

export interface ListVereineOpts {
  pagination: { page: number; pageSize: number };
  sort?: AdminVereinSortKey;
  dir?: "asc" | "desc";
  filter?: {
    /** Subscription-Status filter (active/trialing/past_due/cancelled/paused). */
    status?: string;
    /** Plan filter (basic/pro/verein) — matches ANY teamLicense.plan. */
    plan?: string;
    /** "verified" | "unverified" | undefined */
    verified?: "yes" | "no";
    /** ILIKE substring match against clubs.ort or clubs.name. */
    search?: string;
  };
}

export async function listVereineForAdmin(
  opts: ListVereineOpts
): Promise<PaginatedResult<AdminVereinRow>> {
  const conds: SQL[] = [];
  if (opts.filter?.search) {
    const pat = `%${opts.filter.search}%`;
    conds.push(
      or(ilike(clubs.name, pat), ilike(clubs.ort, pat), ilike(clubs.slug, pat))! as SQL
    );
  }
  if (opts.filter?.verified === "yes") conds.push(isNotNull(clubs.verifiedAt));
  if (opts.filter?.verified === "no") conds.push(isNull(clubs.verifiedAt));
  if (opts.filter?.status) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM subscriptions s WHERE s.club_id = "clubs"."id" AND s.status::text = ${opts.filter.status})`
    );
  }
  if (opts.filter?.plan) {
    conds.push(
      sql`EXISTS (
        SELECT 1 FROM team_licenses tl
        INNER JOIN subscriptions s ON s.club_id = tl.subscription_club_id
        WHERE s.club_id = "clubs"."id" AND tl.plan::text = ${opts.filter.plan}
      )`
    );
  }
  const whereExpr = conds.length > 0 ? and(...conds) : undefined;

  const orderExpr = adminVereinOrder(opts.sort, opts.dir);

  // Note: subqueries reference `"clubs"."id"` literally (hand-written) — Drizzle's
  // `${clubs.id}` interpolation only renders `"id"` unqualified, which collides
  // with the subquery's own table aliases.
  const baseSelect = {
    id: clubs.id,
    slug: clubs.slug,
    name: clubs.name,
    ort: clubs.ort,
    verifiedAt: clubs.verifiedAt,
    createdAt: clubs.createdAt,
    subscriptionStatus: subscriptions.status,
    billingCycle: subscriptions.billingCycle,
    teamCount: sql<number>`(SELECT COUNT(*)::int FROM teams t WHERE t.club_id = "clubs"."id")`.as(
      "team_count"
    ),
    memberCount:
      sql<number>`(SELECT COUNT(*)::int FROM club_memberships cm WHERE cm.club_id = "clubs"."id")`.as(
        "member_count"
      ),
    sponsorCount: sql<number>`(
      SELECT COUNT(DISTINCT pl.sponsor_id)::int FROM pledges pl
      INNER JOIN teams t ON t.id = pl.team_id
      WHERE t.club_id = "clubs"."id"
    )`.as("sponsor_count"),
    topPlan: sql<string>`(
      SELECT tl.plan::text FROM team_licenses tl
      WHERE tl.subscription_club_id = "clubs"."id"
      LIMIT 1
    )`.as("top_plan")
  };

  const dataQuery = db
    .select(baseSelect)
    .from(clubs)
    .leftJoin(subscriptions, eq(subscriptions.clubId, clubs.id))
    .where(whereExpr)
    .orderBy(...orderExpr)
    .$dynamic();

  const countQuery = db
    .select({ count: countStar() })
    .from(clubs)
    .where(whereExpr)
    .$dynamic();

  return paginate<AdminVereinRow>(dataQuery, countQuery, opts.pagination);
}

function adminVereinOrder(
  sort: AdminVereinSortKey | undefined,
  dir: "asc" | "desc" | undefined
): SQL[] {
  const d = dir === "asc" ? asc : desc;
  switch (sort) {
    case "name":
      return [d(clubs.name)];
    case "ort":
      return [d(clubs.ort), desc(clubs.createdAt)];
    case "status":
      return [d(subscriptions.status), desc(clubs.createdAt)];
    case "createdAt":
    default:
      return [desc(clubs.createdAt)];
  }
}

// ---------------------------------------------------------------------------
// Single Verein detail (drill-down)
// ---------------------------------------------------------------------------

export interface VereinDetail {
  club: {
    id: string;
    slug: string;
    name: string;
    ort: string | null;
    addressJson: unknown;
    iban: string | null;
    taxId: string | null;
    verifiedAt: Date | null;
    createdAt: Date;
    onboardingStatus: string;
    logoUrl: string | null;
  };
  subscription: {
    status: string;
    billingCycle: string;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    pausedUntil: Date | null;
  } | null;
  members: Array<{
    userId: string;
    email: string;
    name: string | null;
    role: string;
    joinedAt: Date;
  }>;
  teams: Array<{
    id: string;
    name: string;
    saison: string;
    isActive: boolean;
    discoverable: boolean;
    verifiedAt: Date | null;
    plan: string | null;
    licenseStatus: string | null;
  }>;
  recentCharges: Array<{
    id: string;
    amountCents: number;
    triggerType: string;
    status: string;
    createdAt: Date;
    sponsorDisplayName: string;
    teamName: string;
  }>;
}

export async function getVereinDetail(slug: string): Promise<VereinDetail | null> {
  const [club] = await db.select().from(clubs).where(eq(clubs.slug, slug)).limit(1);
  if (!club) return null;

  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.clubId, club.id))
    .limit(1);

  const members = await db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: clubMemberships.role,
      joinedAt: clubMemberships.createdAt
    })
    .from(clubMemberships)
    .innerJoin(users, eq(users.id, clubMemberships.userId))
    .where(eq(clubMemberships.clubId, club.id))
    .orderBy(asc(clubMemberships.role));

  const teamRows = await db
    .select({
      id: teams.id,
      name: teams.name,
      saison: teams.saison,
      isActive: teams.isActive,
      discoverable: teams.discoverable,
      verifiedAt: teams.verifiedAt,
      plan: teamLicenses.plan,
      licenseStatus: teamLicenses.status
    })
    .from(teams)
    .leftJoin(teamLicenses, eq(teamLicenses.teamId, teams.id))
    .where(eq(teams.clubId, club.id))
    .orderBy(desc(teams.createdAt));

  const recentCharges = await db
    .select({
      id: charges.id,
      amountCents: charges.amountCents,
      triggerType: charges.triggerType,
      status: charges.status,
      createdAt: charges.createdAt,
      sponsorDisplayName: sponsors.displayName,
      teamName: teams.name
    })
    .from(charges)
    .innerJoin(pledges, eq(pledges.id, charges.pledgeId))
    .innerJoin(sponsors, eq(sponsors.id, pledges.sponsorId))
    .innerJoin(teams, eq(teams.id, pledges.teamId))
    .where(eq(teams.clubId, club.id))
    .orderBy(desc(charges.createdAt))
    .limit(20);

  return {
    club: {
      id: club.id,
      slug: club.slug,
      name: club.name,
      ort: club.ort,
      addressJson: club.addressJson,
      iban: club.iban,
      taxId: club.taxId,
      verifiedAt: club.verifiedAt,
      createdAt: club.createdAt,
      onboardingStatus: club.onboardingStatus,
      logoUrl: club.logoUrl
    },
    subscription: sub
      ? {
          status: sub.status,
          billingCycle: sub.billingCycle,
          stripeCustomerId: sub.stripeCustomerId,
          stripeSubscriptionId: sub.stripeSubscriptionId,
          trialEndsAt: sub.trialEndsAt,
          currentPeriodEnd: sub.currentPeriodEnd,
          pausedUntil: sub.pausedUntil
        }
      : null,
    members,
    teams: teamRows,
    recentCharges
  };
}

// ---------------------------------------------------------------------------
// /admin/users list
// ---------------------------------------------------------------------------

export const ADMIN_USER_SORT_KEYS = ["email", "createdAt", "name"] as const;
export type AdminUserSortKey = (typeof ADMIN_USER_SORT_KEYS)[number];

export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  createdAt: Date;
  deletionRequestedAt: Date | null;
  sponsorCount: number;
  clubMembershipCount: number;
  pledgeCount: number;
}

export interface ListUsersOpts {
  pagination: { page: number; pageSize: number };
  sort?: AdminUserSortKey;
  dir?: "asc" | "desc";
  filter?: {
    hasSponsor?: boolean;
    hasClubMembership?: boolean;
    hasPledges?: boolean;
    search?: string;
  };
}

export async function listUsersForAdmin(
  opts: ListUsersOpts
): Promise<PaginatedResult<AdminUserRow>> {
  const conds: SQL[] = [];
  if (opts.filter?.search) {
    const pat = `%${opts.filter.search}%`;
    conds.push(or(ilike(users.email, pat), ilike(users.name, pat))! as SQL);
  }
  if (opts.filter?.hasSponsor) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM sponsors s WHERE s.user_id = "users"."id")`
    );
  }
  if (opts.filter?.hasClubMembership) {
    conds.push(
      sql`EXISTS (SELECT 1 FROM club_memberships cm WHERE cm.user_id = "users"."id")`
    );
  }
  if (opts.filter?.hasPledges) {
    conds.push(
      sql`EXISTS (
        SELECT 1 FROM pledges p
        INNER JOIN sponsors s ON s.id = p.sponsor_id
        WHERE s.user_id = "users"."id"
      )`
    );
  }
  const whereExpr = conds.length > 0 ? and(...conds) : undefined;

  // Important: we hand-write `"users"."id"` inside the subqueries to avoid
  // "column reference 'id' is ambiguous" — Drizzle's `${users.id}` interpolation
  // renders just `"id"` (unqualified) which collides with the subquery's own
  // `id` columns from sponsors / club_memberships / pledges.
  const dataQuery = db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      deletionRequestedAt: users.deletionRequestedAt,
      sponsorCount:
        sql<number>`(SELECT COUNT(*)::int FROM sponsors s WHERE s.user_id = "users"."id")`.as(
          "sponsor_count"
        ),
      clubMembershipCount:
        sql<number>`(SELECT COUNT(*)::int FROM club_memberships cm WHERE cm.user_id = "users"."id")`.as(
          "club_membership_count"
        ),
      pledgeCount: sql<number>`(
        SELECT COUNT(*)::int FROM pledges p
        INNER JOIN sponsors s ON s.id = p.sponsor_id
        WHERE s.user_id = "users"."id"
      )`.as("pledge_count")
    })
    .from(users)
    .where(whereExpr)
    .orderBy(...adminUserOrder(opts.sort, opts.dir))
    .$dynamic();

  const countQuery = db
    .select({ count: countStar() })
    .from(users)
    .where(whereExpr)
    .$dynamic();

  return paginate<AdminUserRow>(dataQuery, countQuery, opts.pagination);
}

function adminUserOrder(
  sort: AdminUserSortKey | undefined,
  dir: "asc" | "desc" | undefined
): SQL[] {
  const d = dir === "asc" ? asc : desc;
  switch (sort) {
    case "email":
      return [d(users.email)];
    case "name":
      return [d(users.name), desc(users.createdAt)];
    case "createdAt":
    default:
      return [desc(users.createdAt)];
  }
}

// ---------------------------------------------------------------------------
// Single user drill-down
// ---------------------------------------------------------------------------

export interface UserDetail {
  user: {
    id: string;
    email: string;
    name: string | null;
    emailVerified: boolean;
    isPlatformAdmin: boolean;
    createdAt: Date;
    deletionRequestedAt: Date | null;
  };
  sponsors: Array<{
    id: string;
    displayName: string;
    type: string;
    createdAt: Date;
    pledgeCount: number;
    totalAmountCents: number;
  }>;
  clubMemberships: Array<{
    clubId: string;
    clubSlug: string;
    clubName: string;
    role: string;
    createdAt: Date;
  }>;
  recentPledges: Array<{
    id: string;
    status: string;
    teamName: string;
    clubName: string;
    clubSlug: string;
    createdAt: Date;
    endsAt: Date;
  }>;
}

export async function getUserDetail(userId: string): Promise<UserDetail | null> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;

  const sponsorRows = await db.select().from(sponsors).where(eq(sponsors.userId, userId));
  const sponsorIds = sponsorRows.map((s) => s.id);

  // Per-sponsor pledge-count: compute via plain query on `pledges` to avoid
  // the LEFT JOIN-with-charges row-multiplication pitfall.
  const pledgeCounts = sponsorIds.length
    ? await db
        .select({
          sponsorId: pledges.sponsorId,
          c: sql<number>`COUNT(*)::int`
        })
        .from(pledges)
        .where(inArray(pledges.sponsorId, sponsorIds))
        .groupBy(pledges.sponsorId)
    : [];

  const chargeSums = sponsorIds.length
    ? await db
        .select({
          sponsorId: pledges.sponsorId,
          total: sql<number>`COALESCE(SUM(${charges.amountCents}), 0)::int`
        })
        .from(charges)
        .innerJoin(pledges, eq(pledges.id, charges.pledgeId))
        .where(inArray(pledges.sponsorId, sponsorIds))
        .groupBy(pledges.sponsorId)
    : [];

  const pledgeCountBySponsor = new Map(pledgeCounts.map((p) => [p.sponsorId, Number(p.c)]));
  const chargeSumBySponsor = new Map(chargeSums.map((p) => [p.sponsorId, Number(p.total)]));

  const clubMembershipRows = await db
    .select({
      clubId: clubs.id,
      clubSlug: clubs.slug,
      clubName: clubs.name,
      role: clubMemberships.role,
      createdAt: clubMemberships.createdAt
    })
    .from(clubMemberships)
    .innerJoin(clubs, eq(clubs.id, clubMemberships.clubId))
    .where(eq(clubMemberships.userId, userId));

  const recentPledges = sponsorIds.length
    ? await db
        .select({
          id: pledges.id,
          status: pledges.status,
          teamName: teams.name,
          clubName: clubs.name,
          clubSlug: clubs.slug,
          createdAt: pledges.createdAt,
          endsAt: pledges.endsAt
        })
        .from(pledges)
        .innerJoin(teams, eq(teams.id, pledges.teamId))
        .innerJoin(clubs, eq(clubs.id, teams.clubId))
        .where(inArray(pledges.sponsorId, sponsorIds))
        .orderBy(desc(pledges.createdAt))
        .limit(20)
    : [];

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      isPlatformAdmin: user.isPlatformAdmin,
      createdAt: user.createdAt,
      deletionRequestedAt: user.deletionRequestedAt
    },
    sponsors: sponsorRows.map((s) => ({
      id: s.id,
      displayName: s.displayName,
      type: s.type,
      createdAt: s.createdAt,
      pledgeCount: pledgeCountBySponsor.get(s.id) ?? 0,
      totalAmountCents: chargeSumBySponsor.get(s.id) ?? 0
    })),
    clubMemberships: clubMembershipRows,
    recentPledges
  };
}
