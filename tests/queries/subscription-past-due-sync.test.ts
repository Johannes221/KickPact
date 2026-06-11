/**
 * past_due-Anker im Webhook-Sync (Audit 2026-06-11 / Phase 2 / A5).
 *
 * Der erste Wechsel auf past_due setzt pastDueSince; weitere Syncs im
 * past_due-Zustand verschieben den Anker NICHT (COALESCE); jeder andere
 * Status nullt ihn. Damit ist die 7-Tage-Grace deterministisch, statt an
 * `updatedAt` zu hängen (das jeder Sync bumpt).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { clubs, subscriptions, users } from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import {
  setSubscriptionStatusByCustomer,
  syncSubscriptionForClub
} from "@/lib/db/queries/subscriptions";

async function seed() {
  const db = await getTestDb();
  await db.insert(users).values({ id: "u_pd", email: "pd@example.com" });
  await db.insert(clubs).values({ id: "c_pd", slug: "pd-fc", name: "PD FC" });
  await db.insert(subscriptions).values({
    clubId: "c_pd",
    stripeCustomerId: "cus_pd",
    stripeSubscriptionId: "sub_pd",
    status: "active",
    billingCycle: "monthly"
  });
  return db;
}

async function readRow() {
  const db = await getTestDb();
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.clubId, "c_pd"))
    .limit(1);
  return row;
}

describe.skipIf(isIntegrationDbDisabled)("pastDueSince-Anker (A5)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("erster past_due-Sync setzt den Anker, zweiter verschiebt ihn nicht", async () => {
    await seed();

    await setSubscriptionStatusByCustomer("cus_pd", "past_due");
    const first = await readRow();
    expect(first.pastDueSince).not.toBeNull();

    // Zweiter Sync (z.B. erneuter Webhook) — Anker bleibt identisch.
    await new Promise((r) => setTimeout(r, 30));
    await syncSubscriptionForClub("c_pd", {
      stripeSubscriptionId: "sub_pd",
      status: "past_due",
      trialEndsAt: null,
      currentPeriodEnd: null,
      pausedUntil: null
    });
    const second = await readRow();
    expect(second.pastDueSince?.getTime()).toBe(first.pastDueSince?.getTime());
    // updatedAt wurde dagegen gebumpt — genau deshalb braucht es den Anker.
    expect(second.updatedAt.getTime()).toBeGreaterThanOrEqual(first.updatedAt.getTime());
  });

  it("Wechsel zurück auf active nullt den Anker", async () => {
    await seed();
    await setSubscriptionStatusByCustomer("cus_pd", "past_due");
    await setSubscriptionStatusByCustomer("cus_pd", "active");

    const row = await readRow();
    expect(row.status).toBe("active");
    expect(row.pastDueSince).toBeNull();
  });
});
