/**
 * Trial-Reminder-Mail-Fehler dürfen nicht verschluckt werden.
 *
 * Vorher: bei `result.error` ein stilles `return` → der Inngest-Step galt als
 * erfolgreich (Step-ID enthält das Datum), kein Retry am selben Tag, am
 * Folgetag ist das 7/3/1-Fenster weitergewandert → Mail für immer verloren,
 * während der Push (eigener Step) rausging.
 *
 * Neu: bei `result.error` wirft der Step → Inngest retryt ihn.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createId } from "@paralleldrive/cuid2";

const { resendSendMock, notifyUsersMock } = vi.hoisted(() => ({
  resendSendMock: vi.fn().mockResolvedValue({ id: "stub-id", error: null }),
  notifyUsersMock: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("@/lib/mail/client", () => ({
  resend: { emails: { send: resendSendMock } },
  MAIL_FROM: "KickPact <stub@test.local>"
}));
vi.mock("@/lib/mail/reply-to", () => ({
  getReplyToForClub: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@/lib/notifications/deliver", () => ({
  notifyUsers: notifyUsersMock
}));

import { db } from "@/lib/db/client";
import { users, clubs, clubMemberships, subscriptions } from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import { trialReminders } from "@/lib/inngest/functions/trial-reminders";

/**
 * Step-Stub, der Fehler pro Step-ID mitschneidet (und wie der echte Runner
 * weiterwirft). So sehen wir, ob der Mail-Step geworfen hat → Inngest würde
 * retryen.
 */
function createStepStub() {
  const failures: { id: string; error: unknown }[] = [];
  return {
    failures,
    stub: {
      run: async <T>(id: string, fn: () => Promise<T> | T): Promise<T> => {
        try {
          return await fn();
        } catch (err) {
          failures.push({ id, error: err });
          throw err;
        }
      }
    }
  };
}

async function runTrialCron(step: ReturnType<typeof createStepStub>["stub"]) {
  const fn = (trialReminders as unknown as {
    fn: (ctx: {
      step: typeof step;
      logger: { info: () => void; warn: () => void; error: () => void };
      event: { data?: unknown };
    }) => Promise<{ mailsSent: number }>;
  }).fn;
  return fn({
    step,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    event: { data: {} }
  });
}

/** Legt einen Verein mit Trial-Sub (Ende in 3 Tagen) + Admin an. */
async function seedTrialingClub() {
  const clubId = createId();
  const adminId = createId();
  await db.insert(users).values({
    id: adminId,
    email: `admin-${adminId}@kickpact.local`,
    emailVerified: true,
    name: "Trial Admin",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  await db.insert(clubs).values({
    id: clubId,
    slug: `trial-${clubId.slice(0, 6)}`,
    name: "Trial FC"
  });
  await db.insert(clubMemberships).values({ clubId, userId: adminId, role: "admin" });
  // trialEndsAt in ~3 Tagen (mittags UTC → sicher im Tagesfenster daysLeft=3).
  const endsAt = new Date();
  endsAt.setUTCDate(endsAt.getUTCDate() + 3);
  endsAt.setUTCHours(12, 0, 0, 0);
  await db.insert(subscriptions).values({
    clubId,
    status: "trialing",
    trialEndsAt: endsAt
  });
  return { clubId, adminId };
}

describe("trial-reminders Mail-Fehler", () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
    resendSendMock.mockResolvedValue({ id: "stub-id", error: null });
    notifyUsersMock.mockResolvedValue(undefined);
  });

  it("Mail-Fehler → Mail-Step wirft (Inngest-Retry)", async () => {
    await seedTrialingClub();
    resendSendMock.mockResolvedValue({ error: { message: "smtp down" } });

    const { stub, failures } = createStepStub();
    await runTrialCron(stub);

    const mailFailures = failures.filter((f) => f.id.startsWith("trial-remind-"));
    expect(mailFailures).toHaveLength(1);
  });

  it("Erfolgsfall: kein Step wirft, Mail zählt", async () => {
    await seedTrialingClub();

    const { stub, failures } = createStepStub();
    const result = await runTrialCron(stub);

    expect(failures.filter((f) => f.id.startsWith("trial-remind-"))).toHaveLength(0);
    expect(result.mailsSent).toBeGreaterThan(0);
  });
});
