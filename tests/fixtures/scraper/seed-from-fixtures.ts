/**
 * Seed helpers for integration tests.
 *
 * Reads captured fußball.de fixture JSON (search.json, mannschaften.json) and
 * inserts the corresponding club + teams + a user into the test DB. Then
 * convenience helpers to attach sponsors with pledges + rules so each test
 * case can express "club X has sponsor Y pledging Z" in a few lines.
 *
 * If a fixture JSON file is missing (e.g. mannschaften.json not yet captured
 * for that club), `seedClubFromFixture` falls back to synthesizing one team
 * per FIXTURE_CLUBS entry so dependent tests can still run with stable IDs.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import {
  clubs,
  pledgeRules,
  pledges,
  sponsors,
  teams,
  users,
  type triggerTypeEnum
} from "@/lib/db/schema";
import { FIXTURE_CLUBS, JSON_ROOT } from "./config";
import { getTestDb } from "../../setup/integration-db";

type TriggerType = (typeof triggerTypeEnum.enumValues)[number];

export type SeedResult = {
  clubId: string;
  /** Map from FIXTURE_CLUBS team key (e.g. "herren1") to inserted DB id. */
  teamIds: Record<string, string>;
};

interface CapturedSearch {
  name: string;
  ort?: string | null;
  slug: string;
  vereinId: string;
  url?: string;
}

interface CapturedMannschaft {
  name: string;
  slug: string;
  saison: string;
  teamId: string;
  url?: string;
}

async function loadJsonOrNull<T>(p: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(p, "utf-8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Seeds a club + its configured teams from fixture JSON.
 *
 * Strategy:
 *   1. Read search.json → first hit becomes the club row.
 *   2. Read mannschaften.json (current saison "2526") if present. For each
 *      `FIXTURE_CLUBS[clubKey].teams[]` entry, try to match by name prefix
 *      (case-insensitive). Insert teams with the captured fußball.de IDs.
 *   3. If mannschaften.json is missing or a configured team isn't in it,
 *      synthesize a deterministic placeholder team — tests still get usable
 *      IDs without requiring full fixture capture.
 */
export async function seedClubFromFixture(clubKey: string): Promise<SeedResult> {
  const db = await getTestDb();
  const cfg = FIXTURE_CLUBS.find((c) => c.key === clubKey);
  if (!cfg) throw new Error(`Unknown fixture club key: ${clubKey}`);

  const searchPath = path.join(JSON_ROOT, clubKey, "search.json");
  const mannschaftenPath = path.join(JSON_ROOT, clubKey, "mannschaften.json");
  const search = await loadJsonOrNull<CapturedSearch[]>(searchPath);
  const mannschaften =
    (await loadJsonOrNull<CapturedMannschaft[]>(mannschaftenPath)) ?? [];

  const clubId = `c_${clubKey}`;
  const clubName = search?.[0]?.name ?? `Fixture Club ${clubKey}`;
  const clubVereinId = search?.[0]?.vereinId ?? `VEREIN_${clubKey.toUpperCase()}`;

  await db.insert(clubs).values({
    id: clubId,
    slug: clubKey,
    name: clubName,
    ort: search?.[0]?.ort ?? "Heidelberg",
    isSmallBusiness: true,
    fussballdeVereinId: clubVereinId
  });

  const teamIds: Record<string, string> = {};
  for (const teamCfg of cfg.teams) {
    const searchToken = teamCfg.searchName.toLowerCase().split(" ")[0];
    const match = mannschaften.find((m) =>
      m.name.toLowerCase().includes(searchToken)
    );

    const teamDbId = `t_${clubKey}_${teamCfg.key}`;
    await db.insert(teams).values({
      id: teamDbId,
      clubId,
      name: match?.name ?? `${clubName} ${teamCfg.searchName}`,
      saison: match?.saison ?? teamCfg.saisons[0] ?? "2526",
      fussballdeTeamId: match?.teamId ?? `TEAM_${clubKey}_${teamCfg.key}`.toUpperCase(),
      fussballdeSlug: match?.slug ?? `${clubKey}-${teamCfg.key}`,
      isActive: true
    });
    teamIds[teamCfg.key] = teamDbId;
  }

  return { clubId, teamIds };
}

interface SeedSponsorPledgeOpts {
  /** Unique key — used to deterministically derive user/sponsor/pledge IDs. */
  sponsorKey: string;
  teamDbId: string;
  triggerType: TriggerType;
  amountCents: number;
  requiresApproval?: boolean;
  startsAt?: Date;
  endsAt?: Date;
  monthlyCapCents?: number | null;
  perMatchCapCents?: number | null;
  triggerParamsJson?: Record<string, unknown>;
}

export interface SeedSponsorPledgeResult {
  userId: string;
  sponsorId: string;
  pledgeId: string;
  ruleId: string;
}

/**
 * Seeds a user + sponsor + pledge + single pledge_rule pointing at `teamDbId`.
 * The user is created automatically if missing (sponsors FK → users).
 */
export async function seedSponsorWithPledge(
  opts: SeedSponsorPledgeOpts
): Promise<SeedSponsorPledgeResult> {
  const db = await getTestDb();
  const userId = `u_${opts.sponsorKey}`;
  const sponsorId = `s_${opts.sponsorKey}`;
  const pledgeId = `pl_${opts.sponsorKey}`;
  const ruleId = `pr_${opts.sponsorKey}`;

  // Idempotent user insert — same sponsorKey can be reused across cases
  // within a single test if the harness doesn't reset between them.
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (existing.length === 0) {
    await db.insert(users).values({
      id: userId,
      email: `${opts.sponsorKey}@example.test`
    });
  }

  await db.insert(sponsors).values({
    id: sponsorId,
    userId,
    displayName: opts.sponsorKey,
    type: "familie"
  });

  await db.insert(pledges).values({
    id: pledgeId,
    sponsorId,
    teamId: opts.teamDbId,
    status: "active",
    startsAt: opts.startsAt ?? new Date("2025-08-01T00:00:00Z"),
    // pledges.endsAt is NOT NULL in schema — default to far future.
    endsAt: opts.endsAt ?? new Date("2099-12-31T23:59:59Z"),
    monthlyCapCents: opts.monthlyCapCents ?? null
  });

  await db.insert(pledgeRules).values({
    id: ruleId,
    pledgeId,
    triggerType: opts.triggerType,
    triggerParamsJson: opts.triggerParamsJson ?? {},
    amountCents: opts.amountCents,
    perMatchCapCents: opts.perMatchCapCents ?? null,
    requiresApproval: opts.requiresApproval ?? false
  });

  return { userId, sponsorId, pledgeId, ruleId };
}
