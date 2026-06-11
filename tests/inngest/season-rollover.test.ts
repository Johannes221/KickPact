import { beforeEach, describe, expect, it, vi } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, teams } from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import { seasonRollover } from "@/lib/inngest/functions/season-rollover";

// ───────────────────────── Inngest-Stubs ──────────────────────────

function createStepStub() {
  return {
    run: async <T>(_label: string, fn: () => Promise<T> | T): Promise<T> => {
      return await fn();
    }
  };
}

function createLoggerStub() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

async function runRollover(opts: { nowIso?: string } = {}) {
  const fn = (
    seasonRollover as unknown as {
      fn: (ctx: {
        step: ReturnType<typeof createStepStub>;
        logger: ReturnType<typeof createLoggerStub>;
        event: { data?: { nowIso?: string } };
      }) => Promise<unknown>;
    }
  ).fn;
  return fn({
    step: createStepStub(),
    logger: createLoggerStub(),
    event: { data: opts }
  }) as Promise<{ bumped: number; fromSaison: string; toSaison: string }>;
}

// ───────────────────────── Seed ──────────────────────────

async function seedTeam(opts: { saison: string; isActive: boolean }) {
  const suffix = createId().slice(0, 8);
  const [club] = await db
    .insert(clubs)
    .values({
      slug: `c-${suffix}`,
      name: "Rollover Club",
      onboardingStatus: "completed"
    })
    .returning({ id: clubs.id });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: club.id,
      name: "1. Herren",
      saison: opts.saison,
      fussballdeTeamId: `T_${suffix}`,
      isActive: opts.isActive
    })
    .returning({ id: teams.id });
  return team.id;
}

// Am 15.7.2026 ist die neue Saison "2627"; gebumpt wird alles auf "2526".
const ROLLOVER_NOW = "2026-07-15T04:00:00.000Z";

describe("season-rollover", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("bumpt aktive Teams der Vorsaison auf die neue Saison", async () => {
    const teamId = await seedTeam({ saison: "2526", isActive: true });

    const result = await runRollover({ nowIso: ROLLOVER_NOW });

    expect(result.fromSaison).toBe("2526");
    expect(result.toSaison).toBe("2627");
    expect(result.bumped).toBe(1);

    const [row] = await db
      .select({ saison: teams.saison })
      .from(teams)
      .where(eq(teams.id, teamId));
    expect(row.saison).toBe("2627");
  });

  it("lässt inaktive Teams und fremde Saisons unangetastet", async () => {
    const inactiveId = await seedTeam({ saison: "2526", isActive: false });
    const oldId = await seedTeam({ saison: "2425", isActive: true });

    const result = await runRollover({ nowIso: ROLLOVER_NOW });
    expect(result.bumped).toBe(0);

    const [inactive] = await db
      .select({ saison: teams.saison })
      .from(teams)
      .where(eq(teams.id, inactiveId));
    expect(inactive.saison).toBe("2526");

    const [old] = await db
      .select({ saison: teams.saison })
      .from(teams)
      .where(eq(teams.id, oldId));
    expect(old.saison).toBe("2425");
  });

  it("ist idempotent: zweiter Lauf macht 0 Updates", async () => {
    await seedTeam({ saison: "2526", isActive: true });

    const first = await runRollover({ nowIso: ROLLOVER_NOW });
    expect(first.bumped).toBe(1);

    const second = await runRollover({ nowIso: ROLLOVER_NOW });
    expect(second.bumped).toBe(0);
  });
});
