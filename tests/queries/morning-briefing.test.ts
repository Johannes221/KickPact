import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  teams,
  teamLicenses,
  subscriptions,
  sponsors,
  pledges,
  pledgeRules,
  charges
} from "@/lib/db/schema";
import { getMorningBriefingData } from "@/lib/db/queries/morning-briefing";
import { resetTestDb } from "../setup/db";

const HOUR = 60 * 60 * 1000;
const recent = () => new Date(Date.now() - 1 * HOUR); // innerhalb 24h-Fenster
const old = () => new Date(Date.now() - 48 * HOUR); // außerhalb

async function seedUser(createdAt: Date): Promise<string> {
  const id = createId();
  await db.insert(users).values({
    id,
    email: `u-${id}@kickpact.local`,
    emailVerified: true,
    name: "User",
    createdAt,
    updatedAt: createdAt
  });
  return id;
}

async function seedClub(createdAt: Date): Promise<string> {
  const id = createId();
  await db.insert(clubs).values({
    id,
    slug: `c-${id.slice(0, 8)}`,
    name: `Club ${id.slice(0, 4)}`,
    ort: "Stadt",
    createdAt
  });
  return id;
}

async function seedTeam(clubId: string, createdAt: Date, isActive = true): Promise<string> {
  const id = createId();
  await db.insert(teams).values({
    id,
    clubId,
    name: "1. Mannschaft",
    saison: "2025/26",
    isActive,
    createdAt
  });
  return id;
}

async function seedSubscription(
  clubId: string,
  status: "trialing" | "active",
  createdAt: Date,
  billingCycle: "monthly" | "season_end" = "monthly"
) {
  await db.insert(subscriptions).values({
    clubId,
    status,
    billingCycle,
    createdAt,
    updatedAt: createdAt
  });
}

async function seedActiveLicense(clubId: string, teamId: string, activatedAt: Date) {
  await db.insert(teamLicenses).values({
    id: createId(),
    subscriptionClubId: clubId,
    teamId,
    plan: "pro",
    status: "active",
    activatedAt
  });
}

async function seedConfirmedCharge(teamId: string, amountCents: number, createdAt: Date) {
  const userId = await seedUser(old());
  const [sp] = await db
    .insert(sponsors)
    .values({ id: createId(), userId, displayName: "S", type: "familie" })
    .returning({ id: sponsors.id });
  const [pl] = await db
    .insert(pledges)
    .values({
      sponsorId: sp.id,
      teamId,
      status: "active",
      startsAt: old(),
      endsAt: new Date(Date.now() + 90 * 24 * HOUR)
    })
    .returning({ id: pledges.id });
  const rule = createId();
  await db.insert(pledgeRules).values({
    id: rule,
    pledgeId: pl.id,
    triggerType: "goal_total",
    amountCents
  });
  await db.insert(charges).values({
    pledgeId: pl.id,
    pledgeRuleId: rule,
    triggerType: "goal_total",
    amountCents,
    status: "confirmed",
    createdAt
  });
}

describe("getMorningBriefingData", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("returns all zeros on an empty DB", async () => {
    const b = await getMorningBriefingData();
    expect(b.neu.users).toBe(0);
    expect(b.neu.clubs).toBe(0);
    expect(b.neu.teams).toBe(0);
    expect(b.neu.subscriptions).toBe(0);
    expect(b.neu.activatedLicenses).toBe(0);
    expect(b.neu.chargesCount).toBe(0);
    expect(b.neu.chargesCents).toBe(0);
    expect(b.bestand.users).toBe(0);
    expect(b.bestand.clubs).toBe(0);
    expect(b.bestand.activeTeams).toBe(0);
    expect(b.bestand.activeSubscriptions).toBe(0);
    expect(b.bestand.trialingSubscriptions).toBe(0);
    expect(b.bestand.mrrCents).toBe(0);
  });

  it("counts only entities created within the last 24h as new, but all as bestand", async () => {
    // Nutzer: 2 neu, 1 alt
    await seedUser(recent());
    await seedUser(recent());
    await seedUser(old());

    // Vereine: 1 neu, 1 alt
    const clubNew = await seedClub(recent());
    const clubOld = await seedClub(old());

    // Mannschaften: 1 neu (aktiv), 1 alt (aktiv), 1 alt (inaktiv → nicht im Bestand)
    await seedTeam(clubNew, recent());
    await seedTeam(clubOld, old());
    await seedTeam(clubOld, old(), false);

    const b = await getMorningBriefingData();

    expect(b.neu.users).toBe(2);
    expect(b.bestand.users).toBe(3);

    expect(b.neu.clubs).toBe(1);
    expect(b.bestand.clubs).toBe(2);

    expect(b.neu.teams).toBe(1); // nur die im Fenster erstellte Mannschaft
    expect(b.bestand.activeTeams).toBe(2); // beide aktiven, der inaktive nicht
  });

  it("counts new subscriptions, activated licenses and confirmed charges in the window", async () => {
    const clubA = await seedClub(recent());
    const teamA = await seedTeam(clubA, recent());

    // 1 neues aktives Abo (heute), 1 altes Trial-Abo
    await seedSubscription(clubA, "active", recent());
    const clubB = await seedClub(old());
    await seedSubscription(clubB, "trialing", old());

    // Lizenz heute aktiviert (Verkauf)
    await seedActiveLicense(clubA, teamA, recent());

    // Charges: 1 heute (2000), 1 alt (9999)
    await seedConfirmedCharge(teamA, 2000, recent());
    await seedConfirmedCharge(teamA, 9999, old());

    const b = await getMorningBriefingData();

    expect(b.neu.subscriptions).toBe(1);
    expect(b.neu.activatedLicenses).toBe(1);
    expect(b.neu.chargesCount).toBe(1);
    expect(b.neu.chargesCents).toBe(2000);

    expect(b.bestand.activeSubscriptions).toBe(1);
    expect(b.bestand.trialingSubscriptions).toBe(1);
    expect(b.bestand.mrrCents).toBe(899); // pro monthly
  });
});
