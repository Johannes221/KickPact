"use server";

import { db } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import { pledges, sponsors, teams, clubs, users } from "@/lib/db/schema";
import {
  verifySeasonRenewalToken,
  type SeasonRenewalTokenPayload
} from "@/lib/auth/season-renewal-token";
import {
  clonePledgeForNextSeason,
  findNextSeasonTeam
} from "@/lib/db/queries/season-renewal";
import { sponsorLabelSql } from "@/lib/db/queries/sponsor-label";

/**
 * Plan 3 Teil 2 — Public (token-based) Saison-Renewal-Actions.
 *
 * Werden von `/season-renewal/[token]/page.tsx` aufgerufen — kein Login
 * notwendig, Auth via HMAC-Token.
 */

export async function inspectSeasonRenewalToken(token: string): Promise<
  | {
      ok: true;
      pledgeId: string;
      nextSaison: string;
      currentSaison: string;
      sponsorName: string;
      teamName: string;
      clubName: string;
      endsAt: Date;
      nextSeasonTeamExists: boolean;
      alreadyCloned: boolean;
    }
  | { ok: false; error: string }
> {
  let payload: SeasonRenewalTokenPayload;
  try {
    payload = verifySeasonRenewalToken(token);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Ungültiger Link."
    };
  }

  const [row] = await db
    .select({
      pledgeEndsAt: pledges.endsAt,
      teamId: pledges.teamId,
      sponsorId: pledges.sponsorId,
      currentSaison: teams.saison,
      sponsorName: sponsorLabelSql,
      teamName: teams.name,
      clubName: clubs.name,
      sponsorEmail: users.email
    })
    .from(pledges)
    .innerJoin(sponsors, eq(pledges.sponsorId, sponsors.id))
    .innerJoin(users, eq(sponsors.userId, users.id))
    .innerJoin(teams, eq(pledges.teamId, teams.id))
    .innerJoin(clubs, eq(teams.clubId, clubs.id))
    .where(eq(pledges.id, payload.pledgeId))
    .limit(1);

  if (!row) {
    return { ok: false, error: "Pledge nicht gefunden." };
  }

  const nextTeam = await findNextSeasonTeam(row.teamId, payload.nextSaison);

  // Review M1 (2026-06-11): alreadyCloned via Provenance (clonedFromPledgeId),
  // NICHT via "existiert irgendeine Pledge (sponsor, team)" — nach dem
  // Saison-Bump ist das Ziel dieselbe Team-Row und die nackte Existenzprüfung
  // fand die ORIGINAL-Pledge → "bereits verlängert"-Anzeige ohne Verlängerung.
  const [existingClone] = await db
    .select({ id: pledges.id })
    .from(pledges)
    .where(eq(pledges.clonedFromPledgeId, payload.pledgeId))
    .limit(1);
  const alreadyCloned = !!existingClone;

  return {
    ok: true,
    pledgeId: payload.pledgeId,
    nextSaison: payload.nextSaison,
    currentSaison: row.currentSaison,
    sponsorName: row.sponsorName,
    teamName: row.teamName,
    clubName: row.clubName,
    endsAt: row.pledgeEndsAt instanceof Date ? row.pledgeEndsAt : new Date(row.pledgeEndsAt),
    // Review M2: Seit dem Same-Row-Fallback in clonePledgeForNextSeason ist
    // die Verlängerung IMMER möglich, solange die Team-Row existiert — die
    // UI darf den Renew-Button nicht mehr an eine dedizierte Next-Season-Row
    // knüpfen (vor dem 15.7.-Bump existiert die nie).
    nextSeasonTeamExists: true,
    alreadyCloned
  };
}

export async function confirmSeasonRenewal(token: string): Promise<
  | { ok: true; newPledgeId: string; targetSaison: string }
  | { ok: false; error: string }
> {
  let payload: SeasonRenewalTokenPayload;
  try {
    payload = verifySeasonRenewalToken(token);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Ungültiger Link."
    };
  }

  try {
    const result = await clonePledgeForNextSeason(
      payload.pledgeId,
      payload.nextSaison
    );
    return {
      ok: true,
      newPledgeId: result.pledgeId,
      targetSaison: result.targetSaison
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Verlängerung fehlgeschlagen."
    };
  }
}

/**
 * Decline ist semantisch ein No-Op — die Pledge läuft regulär aus.
 * Wir geben trotzdem eine Bestätigung zurück, damit die Page eine
 * Success-Message rendern kann.
 */
export async function declineSeasonRenewal(token: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    verifySeasonRenewalToken(token);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Ungültiger Link."
    };
  }
}
