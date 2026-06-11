import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db/client";
import { seasons } from "@/lib/db/schema";
import { resetTestDb } from "../setup/db";
import { computeTrialEndsAt } from "@/lib/billing/trial";

/**
 * Phase 3 / R5 — computeTrialEndsAt: 30 Tage Trial, aber mindestens
 * 30 Tage IN der Saison (Sommer-Onboardings verlieren den Trial sonst
 * an die spielfreie Zeit).
 */

const DAY = 24 * 60 * 60 * 1000;

async function seedSeasons() {
  await db.insert(seasons).values([
    {
      code: "2526",
      region: "DFB",
      startsAt: new Date("2025-08-01T00:00:00Z"),
      endsAt: new Date("2026-06-30T23:59:59Z"),
      matchdayFiveAt: new Date("2025-09-15T23:59:59Z")
    },
    {
      code: "2627",
      region: "DFB",
      startsAt: new Date("2026-08-01T00:00:00Z"),
      endsAt: new Date("2027-05-31T23:59:59Z"),
      matchdayFiveAt: new Date("2026-09-15T23:59:59Z")
    }
  ]);
}

describe("computeTrialEndsAt", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("(a) Sommer-Onboarding 01.07.2026 → Trial endet 31.08. (30 Tage IN Saison 26/27)", async () => {
    await seedSeasons();
    const now = new Date("2026-07-01T10:00:00Z");
    const result = await computeTrialEndsAt(now);
    expect(result.toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });

  it("(b) Onboarding mitten in der Saison 15.10.2026 → now + 30 Tage", async () => {
    await seedSeasons();
    const now = new Date("2026-10-15T10:00:00Z");
    const result = await computeTrialEndsAt(now);
    expect(result.getTime()).toBe(now.getTime() + 30 * DAY);
  });

  it("(c) keine seasons-Row → Fallback now + 30 Tage", async () => {
    const now = new Date("2026-07-01T10:00:00Z");
    const result = await computeTrialEndsAt(now);
    expect(result.getTime()).toBe(now.getTime() + 30 * DAY);
  });

  it("(d) Review N4: Onboarding am 1.6. sieht den 1.8.-Saisonstart (70d-Horizont, keine Klippe)", async () => {
    await seedSeasons();
    const now = new Date("2026-06-01T10:00:00Z");
    const result = await computeTrialEndsAt(now);
    expect(result.toISOString()).toBe("2026-08-31T00:00:00.000Z");
  });
});
