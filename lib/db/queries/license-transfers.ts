/**
 * Lizenz-Transfer-Flow Query-Layer (Spec 2026-05-26 §1.4/§1.5, Phase 5 Paket B).
 *
 * Ein Vereins-Vorstand (Club-Admin eines Clubs mit aktiver Vereinslizenz)
 * bittet den Inhaber einer autarken Mannschaft (eigener Container, eigene
 * basic/pro-Lizenz, gleiche fussballdeVereinId), unter die Vereinslizenz zu
 * wechseln. Alle DB-Zugriffe für Request/Decide/Cron-Flip liegen hier —
 * Server-Actions und Inngest-Functions greifen NIE direkt auf die Tabellen.
 */
import { and, asc, desc, eq, inArray, isNull, lte, ne } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clubs,
  teams,
  users,
  clubMemberships,
  subscriptions,
  teamLicenses,
  teamLicenseTransferRequests,
  type LicenseTransferDecision,
  type LicenseTransferStatus
} from "@/lib/db/schema";

/**
 * Hat der Club eine AKTIVE Vereinslizenz? Kriterium: mindestens eine
 * team_licenses-Row mit plan='verein' an seiner Subscription UND
 * subscriptions.status active/trialing. (Guard für requestLicenseTransfer —
 * ohne aktive Vereinslizenz gibt es nichts, worunter das Team wechseln könnte.)
 */
export async function clubHasActiveVereinLicense(clubId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: teamLicenses.id })
    .from(teamLicenses)
    .innerJoin(subscriptions, eq(teamLicenses.subscriptionClubId, subscriptions.clubId))
    .where(
      and(
        eq(teamLicenses.subscriptionClubId, clubId),
        eq(teamLicenses.plan, "verein"),
        inArray(subscriptions.status, ["active", "trialing"])
      )
    )
    .limit(1);
  return !!row;
}

/**
 * Die Master-License der Vereinslizenz: team_licenses-Row mit plan='verein'
 * OHNE Parent an der Subscription des Clubs. Unter sie werden Team-Licenses
 * gebündelt (parentClubLicenseId-Mechanik, vgl. getTeamLicensePlan).
 */
export async function getVereinMasterLicense(clubId: string) {
  const [row] = await db
    .select()
    .from(teamLicenses)
    .where(
      and(
        eq(teamLicenses.subscriptionClubId, clubId),
        eq(teamLicenses.plan, "verein"),
        isNull(teamLicenses.parentClubLicenseId)
      )
    )
    .orderBy(asc(teamLicenses.activatedAt))
    .limit(1);
  return row;
}

export interface LicenseTransferCandidate {
  teamId: string;
  teamName: string;
  saison: string;
  containerClubId: string;
  containerClubName: string;
  /** Status der JÜNGSTEN Anfrage dieses Clubs an das Team (null = nie angefragt). */
  requestStatus: LicenseTransferStatus | null;
  requestCreatedAt: Date | null;
}

/**
 * „Bestehende Mannschaften eures Vereins": autarke Teams desselben realen
 * Vereins (clubs.fussballdeVereinId-Match), die in einem FREMDEN Container
 * leben, eine EIGENE basic/pro-Lizenz ohne Vereinsbündelung haben und noch
 * nicht unter einer Vereinslizenz stehen.
 */
export async function listLicenseTransferCandidatesForClub(
  clubId: string
): Promise<LicenseTransferCandidate[]> {
  const [club] = await db
    .select({ fussballdeVereinId: clubs.fussballdeVereinId })
    .from(clubs)
    .where(eq(clubs.id, clubId))
    .limit(1);
  if (!club?.fussballdeVereinId) return [];

  const rows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      saison: teams.saison,
      containerClubId: clubs.id,
      containerClubName: clubs.name
    })
    .from(teams)
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .innerJoin(teamLicenses, eq(teamLicenses.teamId, teams.id))
    .where(
      and(
        eq(clubs.fussballdeVereinId, club.fussballdeVereinId),
        ne(teams.clubId, clubId),
        isNull(teams.licensedUnderClubId),
        inArray(teamLicenses.plan, ["basic", "pro"]),
        isNull(teamLicenses.parentClubLicenseId)
      )
    )
    .orderBy(asc(teams.name));

  if (rows.length === 0) return [];

  // Jüngste Anfrage dieses Clubs pro Team (für Status-Badges pending/abgelehnt).
  const requestRows = await db
    .select({
      teamId: teamLicenseTransferRequests.teamId,
      status: teamLicenseTransferRequests.status,
      createdAt: teamLicenseTransferRequests.createdAt
    })
    .from(teamLicenseTransferRequests)
    .where(
      and(
        inArray(
          teamLicenseTransferRequests.teamId,
          rows.map((r) => r.teamId)
        ),
        eq(teamLicenseTransferRequests.toClubId, clubId)
      )
    )
    .orderBy(desc(teamLicenseTransferRequests.createdAt));

  const latestByTeam = new Map<string, { status: LicenseTransferStatus; createdAt: Date }>();
  for (const r of requestRows) {
    if (!latestByTeam.has(r.teamId)) {
      latestByTeam.set(r.teamId, { status: r.status, createdAt: r.createdAt });
    }
  }

  return rows.map((r) => {
    const latest = latestByTeam.get(r.teamId);
    return {
      ...r,
      requestStatus: latest?.status ?? null,
      requestCreatedAt: latest?.createdAt ?? null
    };
  });
}

/**
 * Insert einer neuen Transfer-Anfrage. Doppel-pending wird vom partiellen
 * Unique-Index (teamId WHERE status='pending') geblockt — der Caller fängt
 * das via isUniqueViolation ab.
 */
export async function createLicenseTransferRequest(opts: {
  teamId: string;
  toClubId: string;
  fromUserId: string;
  requestedByUserId: string;
}) {
  const [row] = await db
    .insert(teamLicenseTransferRequests)
    .values({
      teamId: opts.teamId,
      toClubId: opts.toClubId,
      fromUserId: opts.fromUserId,
      requestedByUserId: opts.requestedByUserId
    })
    .returning();
  return row;
}

/** Voller Request inkl. Namen für Mails/Detail (oder undefined). */
export async function getLicenseTransferRequestById(requestId: string) {
  const [row] = await db
    .select({
      request: teamLicenseTransferRequests,
      teamName: teams.name,
      teamClubId: teams.clubId,
      toClubName: clubs.name,
      toClubSlug: clubs.slug
    })
    .from(teamLicenseTransferRequests)
    .innerJoin(teams, eq(teamLicenseTransferRequests.teamId, teams.id))
    .innerJoin(clubs, eq(teamLicenseTransferRequests.toClubId, clubs.id))
    .where(eq(teamLicenseTransferRequests.id, requestId))
    .limit(1);
  return row;
}

/** Pending-Anfragen, über die DIESER User entscheiden muss (Karte in /konto). */
export async function listPendingTransferRequestsForUser(userId: string) {
  return db
    .select({
      id: teamLicenseTransferRequests.id,
      teamId: teamLicenseTransferRequests.teamId,
      teamName: teams.name,
      toClubId: teamLicenseTransferRequests.toClubId,
      toClubName: clubs.name,
      requestedByName: users.name,
      createdAt: teamLicenseTransferRequests.createdAt
    })
    .from(teamLicenseTransferRequests)
    .innerJoin(teams, eq(teamLicenseTransferRequests.teamId, teams.id))
    .innerJoin(clubs, eq(teamLicenseTransferRequests.toClubId, clubs.id))
    .innerJoin(users, eq(teamLicenseTransferRequests.requestedByUserId, users.id))
    .where(
      and(
        eq(teamLicenseTransferRequests.fromUserId, userId),
        eq(teamLicenseTransferRequests.status, "pending")
      )
    )
    .orderBy(desc(teamLicenseTransferRequests.createdAt));
}

/** Pending-Anfrage für ein Team (Banner auf dem Team-Dashboard), oder undefined. */
export async function getPendingTransferRequestForTeam(teamId: string) {
  const [row] = await db
    .select({
      id: teamLicenseTransferRequests.id,
      toClubName: clubs.name,
      fromUserId: teamLicenseTransferRequests.fromUserId,
      createdAt: teamLicenseTransferRequests.createdAt
    })
    .from(teamLicenseTransferRequests)
    .innerJoin(clubs, eq(teamLicenseTransferRequests.toClubId, clubs.id))
    .where(
      and(
        eq(teamLicenseTransferRequests.teamId, teamId),
        eq(teamLicenseTransferRequests.status, "pending")
      )
    )
    .limit(1);
  return row;
}

/**
 * Entscheidet einen PENDING-Request (Race-Guard: WHERE status='pending').
 * Returnt die geupdatete Row oder undefined, wenn der Request nicht mehr
 * pending war (Doppelklick, paralleler Decide).
 */
export async function markLicenseTransferDecision(opts: {
  requestId: string;
  status: Exclude<LicenseTransferStatus, "pending">;
  decision: LicenseTransferDecision;
  decidedByUserId: string;
  decisionNote?: string | null;
  effectiveAt?: Date | null;
}) {
  const [row] = await db
    .update(teamLicenseTransferRequests)
    .set({
      status: opts.status,
      decision: opts.decision,
      decisionNote: opts.decisionNote ?? null,
      decidedAt: new Date(),
      decidedByUserId: opts.decidedByUserId,
      effectiveAt: opts.effectiveAt ?? null
    })
    .where(
      and(
        eq(teamLicenseTransferRequests.id, opts.requestId),
        eq(teamLicenseTransferRequests.status, "pending")
      )
    )
    .returning();
  return row;
}

/**
 * Branding-Flip bei Annahme: teams.licensedUnderClubId SOFORT setzen
 * (Rechnungs-Absender wechselt mit der nächsten Rechnung, Spec §1.5).
 */
export async function setTeamLicensedUnder(teamId: string, clubId: string | null) {
  await db
    .update(teams)
    .set({ licensedUnderClubId: clubId })
    .where(eq(teams.id, teamId));
}

/** Accepted-Requests, deren Lizenz-Flip fällig ist (effectiveAt <= now). */
export async function listDueAcceptedLicenseTransfers(now: Date) {
  return db
    .select({
      id: teamLicenseTransferRequests.id,
      teamId: teamLicenseTransferRequests.teamId,
      toClubId: teamLicenseTransferRequests.toClubId,
      effectiveAt: teamLicenseTransferRequests.effectiveAt
    })
    .from(teamLicenseTransferRequests)
    .where(
      and(
        eq(teamLicenseTransferRequests.status, "accepted"),
        lte(teamLicenseTransferRequests.effectiveAt, now)
      )
    )
    .orderBy(asc(teamLicenseTransferRequests.effectiveAt));
}

/** team_licenses-Row einer Mannschaft (oder undefined). */
export async function getTeamLicenseRow(teamId: string) {
  const [row] = await db
    .select()
    .from(teamLicenses)
    .where(eq(teamLicenses.teamId, teamId))
    .limit(1);
  return row;
}

/**
 * Lizenz-Flip (Cron, effectiveAt erreicht): die team_licenses-Row des Teams
 * an die Vereins-Subscription/-Master-License umhängen. Existiert keine Row,
 * wird sie angelegt. plan='verein' wird IMMER gesetzt, damit
 * getTeamLicensePlan auch ohne Master-Row (masterLicenseId=null) korrekt
 * 'verein' auflöst (Priorität 1 bzw. 2 dort). Idempotent: zweiter Aufruf
 * schreibt dieselben Werte.
 */
export async function attachTeamLicenseToVereinLicense(opts: {
  teamId: string;
  toClubId: string;
  masterLicenseId: string | null;
}) {
  const existing = await getTeamLicenseRow(opts.teamId);
  if (existing) {
    await db
      .update(teamLicenses)
      .set({
        subscriptionClubId: opts.toClubId,
        parentClubLicenseId: opts.masterLicenseId,
        plan: "verein",
        status: "active",
        deactivatedAt: null
      })
      .where(eq(teamLicenses.teamId, opts.teamId));
    return;
  }
  await db.insert(teamLicenses).values({
    teamId: opts.teamId,
    subscriptionClubId: opts.toClubId,
    parentClubLicenseId: opts.masterLicenseId,
    plan: "verein",
    status: "active"
  });
}

/**
 * Erster (ältester) Club-Admin eines Clubs. Dient als fromUserId-Auflösung:
 * der „T" einer autarken Mannschaft ist der Admin ihres Container-Clubs.
 * VEREINFACHUNG (dokumentiert): bei mehreren Admins entscheidet der älteste —
 * die team_license hängt an der Container-Subscription, nicht an einem User,
 * daher gibt es keinen härteren „Lizenz-Owner"-Anker im Schema.
 */
export async function getFirstClubAdmin(clubId: string) {
  const [row] = await db
    .select({
      userId: clubMemberships.userId,
      email: users.email,
      name: users.name
    })
    .from(clubMemberships)
    .innerJoin(users, eq(clubMemberships.userId, users.id))
    .where(and(eq(clubMemberships.clubId, clubId), eq(clubMemberships.role, "admin")))
    .orderBy(asc(clubMemberships.createdAt))
    .limit(1);
  return row;
}
