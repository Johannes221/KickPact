import { beforeEach, describe, expect, it, vi } from "vitest";
import { createId } from "@paralleldrive/cuid2";

// ───────────────────────── Mock-Setup ──────────────────────────

const { resendSendMock } = vi.hoisted(() => ({
  resendSendMock: vi.fn().mockResolvedValue({ id: "stub-id", error: null })
}));

vi.mock("@/lib/mail/client", () => ({
  resend: { emails: { send: resendSendMock } },
  MAIL_FROM: "KickPact <stub@test.local>"
}));

vi.mock("@/lib/mail/reply-to", () => ({
  getReplyToForClub: vi.fn().mockResolvedValue(undefined)
}));

process.env.BETTER_AUTH_SECRET ??=
  "test-secret-test-secret-test-secret-test-secret";

import { db } from "@/lib/db/client";
import { eq, and } from "drizzle-orm";
import {
  users,
  clubs,
  teams,
  sponsors,
  pledges,
  pledgeRules,
  sentNotifications
} from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import { seasonRenewalPrompts } from "@/lib/inngest/functions/season-renewal-prompts";
import { findPledgesEligibleForRenewal } from "@/lib/db/queries/season-renewal";

// ───────────────────────── Helpers ──────────────────────────

/**
 * Simuliert Inngest-Step-Runner: `step.run` führt den Body synchron aus
 * und gibt das Ergebnis zurück. Genug für unsere Funktionalitäts-Tests.
 */
function createStepStub() {
  return {
    run: async <T>(_label: string, fn: () => Promise<T> | T): Promise<T> => {
      return await fn();
    }
  };
}

function createLoggerStub() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

/**
 * Lokales Helper, das das innere Cron-Body direkt aufruft, ohne den
 * Inngest-Wire-Layer. Wir können nicht direkt auf seasonRenewalPrompts
 * zugreifen weil die Inngest-Funktion ein wrapped object ist; wir
 * importieren das innere Verhalten direkt aus dem Modul.
 *
 * Workaround: wir testen über die public API von `seasonRenewalPrompts.fn`
 * wenn vorhanden, sonst über einen Re-Implementations-Wrap. Inngest exposes
 * `.opts` / `.fn` je nach Version. Wir gehen den robusten Weg und rufen
 * `(seasonRenewalPrompts as any).fn` auf.
 */
async function runRenewalCron(opts: { daysAhead?: number } = {}) {
  const fn = (seasonRenewalPrompts as unknown as {
    fn: (ctx: {
      step: ReturnType<typeof createStepStub>;
      logger: ReturnType<typeof createLoggerStub>;
      event: { data?: { daysAhead?: number } };
    }) => Promise<unknown>;
  }).fn;
  return fn({
    step: createStepStub(),
    logger: createLoggerStub(),
    event: { data: opts }
  }) as Promise<{
    sent: number;
    skipped: number;
    eligible: number;
    daysAhead: number;
  }>;
}

// ───────────────────────── Seed ──────────────────────────

async function seedPledgeEligibleForRenewal(opts: {
  saison?: string;
  withNextSeasonTeam?: boolean;
  endsAtOffsetDays?: number;
} = {}) {
  const now = new Date();
  const endsAt = new Date(
    now.getTime() + (opts.endsAtOffsetDays ?? 15) * 24 * 60 * 60 * 1000
  );

  const userId = createId();
  await db.insert(users).values({
    id: userId,
    email: `${userId}@test.local`,
    emailVerified: true,
    name: "Test",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  const [club] = await db
    .insert(clubs)
    .values({
      slug: `c-${userId.slice(0, 6)}`,
      name: "Test Club",
      onboardingStatus: "completed"
    })
    .returning({ id: clubs.id });

  const fdId = `T_${userId.slice(0, 6)}`;
  const [team] = await db
    .insert(teams)
    .values({
      clubId: club.id,
      name: "1. Herren",
      saison: opts.saison ?? "2526",
      fussballdeTeamId: fdId,
      isActive: true
    })
    .returning({ id: teams.id });

  let nextTeamId: string | null = null;
  if (opts.withNextSeasonTeam) {
    const [t2] = await db
      .insert(teams)
      .values({
        clubId: club.id,
        name: "1. Herren",
        saison: "2627",
        fussballdeTeamId: fdId,
        isActive: true
      })
      .returning({ id: teams.id });
    nextTeamId = t2.id;
  }

  const sponsorUserId = createId();
  await db.insert(users).values({
    id: sponsorUserId,
    email: `${sponsorUserId}@test.local`,
    emailVerified: true,
    name: "Sponsor",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  const [sponsor] = await db
    .insert(sponsors)
    .values({
      userId: sponsorUserId,
      displayName: "ACME",
      type: "familie"
    })
    .returning({ id: sponsors.id });

  const [pledge] = await db
    .insert(pledges)
    .values({
      sponsorId: sponsor.id,
      teamId: team.id,
      status: "active",
      startsAt: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000),
      endsAt
    })
    .returning({ id: pledges.id });
  await db.insert(pledgeRules).values({
    pledgeId: pledge.id,
    triggerType: "goal_total",
    amountCents: 500,
    requiresApproval: false
  });

  return {
    clubId: club.id,
    teamId: team.id,
    nextTeamId,
    sponsorId: sponsor.id,
    pledgeId: pledge.id,
    sponsorEmail: `${sponsorUserId}@test.local`
  };
}

// ───────────────────────── Tests ──────────────────────────

describe("seasonRenewalPrompts (cron)", () => {
  beforeEach(async () => {
    await resetTestDb();
    resendSendMock.mockClear();
    resendSendMock.mockResolvedValue({ id: "stub-id", error: null });
  });

  it("schickt eine Mail pro eligible Pledge + setzt Dedupe-Eintrag", async () => {
    const seed = await seedPledgeEligibleForRenewal({
      saison: "2526",
      withNextSeasonTeam: true
    });

    const result = await runRenewalCron();
    expect(result.eligible).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(0);
    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const mailArg = resendSendMock.mock.calls[0][0];
    expect(mailArg.to).toBe(seed.sponsorEmail);
    expect(mailArg.subject).toContain("2627");

    // Dedupe-Eintrag in sent_notifications — Default-Seed endet in 15 Tagen → Stage 30
    const [dedupe] = await db
      .select()
      .from(sentNotifications)
      .where(
        and(
          eq(sentNotifications.kind, "season-renewal"),
          eq(sentNotifications.key, `${seed.pledgeId}:2627:30`)
        )
      );
    expect(dedupe).toBeTruthy();
  });

  it("dedupe verhindert zweiten Send für gleiche pledge+saison", async () => {
    await seedPledgeEligibleForRenewal({
      saison: "2526",
      withNextSeasonTeam: true
    });

    await runRenewalCron();
    expect(resendSendMock).toHaveBeenCalledTimes(1);

    resendSendMock.mockClear();
    const second = await runRenewalCron();
    expect(second.sent).toBe(0);
    expect(second.skipped).toBe(1);
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("verarbeitet keine eligible-Pledges wenn keine vorhanden", async () => {
    const result = await runRenewalCron();
    expect(result.eligible).toBe(0);
    expect(result.sent).toBe(0);
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("schickt auch ohne next-season-Team (User kriegt Hinweis in der Page)", async () => {
    await seedPledgeEligibleForRenewal({
      saison: "2526",
      withNextSeasonTeam: false
    });
    const result = await runRenewalCron();
    expect(result.eligible).toBe(1);
    expect(result.sent).toBe(1);
  });

  it("rollback Dedupe wenn Mail-Send fehlschlägt", async () => {
    const seed = await seedPledgeEligibleForRenewal({
      saison: "2526",
      withNextSeasonTeam: true
    });

    resendSendMock.mockResolvedValueOnce({
      id: null,
      error: { name: "ResendError", message: "rate limit" }
    });

    const result = await runRenewalCron();
    expect(result.sent).toBe(0);

    // Dedupe-Eintrag wurde gerollbackt → ein zweiter Lauf würde wieder senden
    const dedupe = await db
      .select()
      .from(sentNotifications)
      .where(
        and(
          eq(sentNotifications.kind, "season-renewal"),
          eq(sentNotifications.key, `${seed.pledgeId}:2627:30`)
        )
      );
    expect(dedupe.length).toBe(0);
  });

  // ─── Phase 3 / R7: Stages 30/14/3 Tage vor endsAt ───

  it("Stage-Auswahl nach Tagen bis Ende: 20d→30er, 10d→14er, 2d→3er", async () => {
    const s30 = await seedPledgeEligibleForRenewal({ endsAtOffsetDays: 20 });
    const s14 = await seedPledgeEligibleForRenewal({ endsAtOffsetDays: 10 });
    const s3 = await seedPledgeEligibleForRenewal({ endsAtOffsetDays: 2 });

    const result = await runRenewalCron();
    expect(result.sent).toBe(3);

    const keys = (
      await db
        .select({ key: sentNotifications.key })
        .from(sentNotifications)
        .where(eq(sentNotifications.kind, "season-renewal"))
    ).map((r) => r.key);
    expect(keys).toContain(`${s30.pledgeId}:2627:30`);
    expect(keys).toContain(`${s14.pledgeId}:2627:14`);
    expect(keys).toContain(`${s3.pledgeId}:2627:3`);
  });

  it("Dedupe ist pro Stage: gesendete 30er-Stage blockt die 14er nicht", async () => {
    const seed = await seedPledgeEligibleForRenewal({ endsAtOffsetDays: 10 });
    // 30er-Stage wurde (vor 2 Wochen) bereits verschickt
    await db.insert(sentNotifications).values({
      kind: "season-renewal",
      key: `${seed.pledgeId}:2627:30`
    });

    const result = await runRenewalCron();
    expect(result.sent).toBe(1);
    expect(resendSendMock).toHaveBeenCalledTimes(1);

    // … aber die 14er ist jetzt dedupet
    resendSendMock.mockClear();
    const second = await runRenewalCron();
    expect(second.sent).toBe(0);
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("Alt-Key ohne Stage-Suffix zählt als gesendete 30er-Stage (Abwärtskompatibilität)", async () => {
    const seed = await seedPledgeEligibleForRenewal({ endsAtOffsetDays: 20 });
    // Bestands-Key aus der Zeit vor den Stages
    await db.insert(sentNotifications).values({
      kind: "season-renewal",
      key: `${seed.pledgeId}:2627`
    });

    const result = await runRenewalCron();
    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("Alt-Key blockt NUR die 30er-Stage — 14er geht trotzdem raus", async () => {
    const seed = await seedPledgeEligibleForRenewal({ endsAtOffsetDays: 10 });
    await db.insert(sentNotifications).values({
      kind: "season-renewal",
      key: `${seed.pledgeId}:2627`
    });

    const result = await runRenewalCron();
    expect(result.sent).toBe(1);
    expect(resendSendMock).toHaveBeenCalledTimes(1);
  });

  it("findPledgesEligibleForRenewal liefert konsistent zum Job", async () => {
    await seedPledgeEligibleForRenewal({
      saison: "2526",
      withNextSeasonTeam: true,
      endsAtOffsetDays: 10
    });
    const now = new Date();
    const eligible = await findPledgesEligibleForRenewal(now, 30);
    expect(eligible.length).toBe(1);
  });
});
