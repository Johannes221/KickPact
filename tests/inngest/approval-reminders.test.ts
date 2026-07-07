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

process.env.BETTER_AUTH_SECRET ??=
  "test-secret-test-secret-test-secret-test-secret";

import { db } from "@/lib/db/client";
import { eq } from "drizzle-orm";
import {
  users,
  clubs,
  teams,
  matches,
  matchEvents,
  sponsors,
  pledges,
  pledgeRules,
  eventApprovals,
  notificationSettings
} from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import {
  approvalReminders,
  MAX_APPROVAL_REMINDERS
} from "@/lib/inngest/functions/approval-reminders";

function createStepStub() {
  return {
    run: async <T>(_label: string, fn: () => Promise<T> | T): Promise<T> => fn()
  };
}
function createLoggerStub() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

async function runReminderCron() {
  const fn = (approvalReminders as unknown as {
    fn: (ctx: {
      step: ReturnType<typeof createStepStub>;
      logger: ReturnType<typeof createLoggerStub>;
    }) => Promise<{ remindersSent: number; approvalsTouched: number }>;
  }).fn;
  return fn({ step: createStepStub(), logger: createLoggerStub() });
}

const DAY = 24 * 60 * 60 * 1000;

/** Legt eine pending Approval an (default: 10d alt, noch nie erinnert). */
async function seedPendingApproval(opts: {
  reminderCount?: number;
  createdDaysAgo?: number;
  emailRecurring?: boolean;
} = {}) {
  const sponsorUserId = createId();
  await db.insert(users).values({
    id: sponsorUserId,
    email: `${sponsorUserId}@test.local`,
    emailVerified: true,
    name: "Sponsor",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  if (opts.emailRecurring !== undefined) {
    await db.insert(notificationSettings).values({
      userId: sponsorUserId,
      emailRecurring: opts.emailRecurring
    });
  }
  const [club] = await db
    .insert(clubs)
    .values({
      slug: `c-${sponsorUserId.slice(0, 6)}`,
      name: "Test Club",
      onboardingStatus: "completed"
    })
    .returning({ id: clubs.id });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: club.id,
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: `T_${sponsorUserId.slice(0, 6)}`,
      isActive: true
    })
    .returning({ id: teams.id });
  const [sponsor] = await db
    .insert(sponsors)
    .values({ userId: sponsorUserId, displayName: "ACME", type: "familie" })
    .returning({ id: sponsors.id });
  const [pledge] = await db
    .insert(pledges)
    .values({
      sponsorId: sponsor.id,
      teamId: team.id,
      status: "active",
      startsAt: new Date(Date.now() - 180 * DAY),
      endsAt: new Date(Date.now() + 30 * DAY)
    })
    .returning({ id: pledges.id });
  const [rule] = await db
    .insert(pledgeRules)
    .values({
      pledgeId: pledge.id,
      triggerType: "goal_total",
      amountCents: 500,
      requiresApproval: true
    })
    .returning({ id: pledgeRules.id });
  const [match] = await db
    .insert(matches)
    .values({
      teamId: team.id,
      fussballdeSpielId: `fs_${sponsorUserId.slice(0, 6)}`,
      datum: new Date(Date.now() - 20 * DAY),
      heimName: "Test Club",
      gastName: "SV Gegner",
      ergebnisHeim: 1,
      ergebnisGast: 0,
      status: "finished"
    })
    .returning({ id: matches.id });
  const [event] = await db
    .insert(matchEvents)
    .values({ matchId: match.id, minute: 42, type: "tor", side: "heim", source: "manual" })
    .returning({ id: matchEvents.id });
  const [approval] = await db
    .insert(eventApprovals)
    .values({
      matchEventId: event.id,
      pledgeRuleId: rule.id,
      status: "pending",
      reminderCount: opts.reminderCount ?? 0,
      createdAt: new Date(Date.now() - (opts.createdDaysAgo ?? 10) * DAY),
      expiresAt: new Date(Date.now() + 14 * DAY)
    })
    .returning({ id: eventApprovals.id });

  return { approvalId: approval.id, sponsorUserId };
}

describe("approvalReminders (cron)", () => {
  beforeEach(async () => {
    await resetTestDb();
    resendSendMock.mockClear();
    resendSendMock.mockResolvedValue({ id: "stub-id", error: null });
  });

  it("erinnert eine pending Approval unter dem Cap + zählt hoch", async () => {
    const { approvalId } = await seedPendingApproval({ reminderCount: 0 });
    const res = await runReminderCron();
    expect(res.remindersSent).toBe(1);
    expect(resendSendMock).toHaveBeenCalledTimes(1);

    const [row] = await db
      .select({ c: eventApprovals.reminderCount })
      .from(eventApprovals)
      .where(eq(eventApprovals.id, approvalId));
    expect(row.c).toBe(1);
  });

  it("stoppt am Cap: reminderCount = MAX → keine Mail mehr", async () => {
    await seedPendingApproval({ reminderCount: MAX_APPROVAL_REMINDERS });
    const res = await runReminderCron();
    expect(res.remindersSent).toBe(0);
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("respektiert das E-Mail-Opt-out serverseitig (kein Send)", async () => {
    await seedPendingApproval({ reminderCount: 0, emailRecurring: false });
    const res = await runReminderCron();
    expect(res.remindersSent).toBe(0);
    expect(resendSendMock).not.toHaveBeenCalled();
  });
});
