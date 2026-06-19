import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db/client";
import { clubs, subscriptions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  syncAppleSubscriptionForClub,
  getClubIdByOriginalTransactionId,
  getSubscriptionProvider
} from "@/lib/db/queries/subscriptions";

const CLUB_ID = "test_apple_club_1";

beforeEach(async () => {
  await db.delete(subscriptions).where(eq(subscriptions.clubId, CLUB_ID));
  await db.delete(clubs).where(eq(clubs.id, CLUB_ID));
  await db.insert(clubs).values({
    id: CLUB_ID, slug: "apple-test", name: "Apple Test"
  });
  await db.insert(subscriptions).values({ clubId: CLUB_ID, status: "trialing" });
});

describe("syncAppleSubscriptionForClub", () => {
  it("writes provider=apple + identifiers + status", async () => {
    await syncAppleSubscriptionForClub(CLUB_ID, {
      originalTransactionId: "apple_otx_1",
      status: "active",
      billingCycle: "season_end",
      appleExpiresAt: new Date("2027-01-01")
    });
    const [row] = await db.select().from(subscriptions)
      .where(eq(subscriptions.clubId, CLUB_ID));
    expect(row.provider).toBe("apple");
    expect(row.appleOriginalTransactionId).toBe("apple_otx_1");
    expect(row.status).toBe("active");
    expect(row.billingCycle).toBe("season_end");
  });
});

describe("reverse lookups", () => {
  it("finds the club by original transaction id", async () => {
    await syncAppleSubscriptionForClub(CLUB_ID, {
      originalTransactionId: "apple_otx_2",
      status: "active",
      billingCycle: "monthly",
      appleExpiresAt: null
    });
    expect(await getClubIdByOriginalTransactionId("apple_otx_2")).toBe(CLUB_ID);
    expect(await getClubIdByOriginalTransactionId("nope")).toBeNull();
  });

  it("reads the current provider", async () => {
    expect(await getSubscriptionProvider(CLUB_ID)).toBeNull(); // trial, kein Kauf
    await syncAppleSubscriptionForClub(CLUB_ID, {
      originalTransactionId: "apple_otx_3",
      status: "active",
      billingCycle: "monthly",
      appleExpiresAt: null
    });
    expect(await getSubscriptionProvider(CLUB_ID)).toBe("apple");
  });
});
