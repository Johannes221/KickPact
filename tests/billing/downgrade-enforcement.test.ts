/**
 * Basic-Downgrade-Enforcement (Audit 2026-06-11 / Phase 2 / A7).
 *
 * Beim Downgrade Pro→Basic (Stripe-Webhook) müssen die Basic-Caps wieder
 * gelten: max. 5 Sponsoren pro Team, max. 3 Regeln pro Sponsor. Vorher blieb
 * der Über-Cap-Bestand einfach aktiv — der Verein bekam Pro-Leistung zum
 * Basic-Preis und die Charge-Pipeline produzierte weiter aus allen Regeln.
 *
 * Regeln:
 * - Über-Cap-SPONSOREN (neueste zuerst raus, die 5 ältesten bleiben):
 *   alle aktiven Pledges dieser Sponsoren → status='paused' + pausedAt=now.
 * - Über-Cap-REGELN der verbleibenden Sponsoren (>3, älteste bleiben):
 *   effectiveUntil=now (vergangene Spiele bleiben abrechenbar).
 * - Deterministisch + idempotent (zweiter Webhook-Run ändert nichts mehr).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, asc } from "drizzle-orm";
import {
  users,
  clubs,
  clubMemberships,
  teams,
  sponsors,
  pledges,
  pledgeRules
} from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";

vi.mock("@/lib/mail/client", () => ({
  resend: { emails: { send: vi.fn().mockResolvedValue({ error: null }) } },
  MAIL_FROM: "KickPact <test@kickpact.com>"
}));

import { enforceBasicDowngrade } from "@/lib/billing/downgrade-enforcement";
import { resend } from "@/lib/mail/client";

async function seedClubWithSponsors(opts: {
  sponsorCount: number;
  rulesForFirstSponsor?: number;
}) {
  const db = await getTestDb();
  await db.insert(users).values({ id: "u_dg", email: "dg@example.com" });
  await db
    .insert(clubs)
    .values({ id: "c_dg", slug: "downgrade-fc", name: "Downgrade FC" });
  await db.insert(clubMemberships).values({
    clubId: "c_dg",
    userId: "u_dg",
    role: "admin"
  });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: "c_dg",
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: "TEAM_DG",
      fussballdeSlug: "downgrade-fc-1",
      isActive: true
    })
    .returning();

  const sponsorIds: string[] = [];
  const base = new Date("2026-01-01T00:00:00Z").getTime();
  for (let i = 0; i < opts.sponsorCount; i++) {
    // Jeder Sponsor ist eine eigene Person (sponsors.user_id ist UNIQUE) —
    // mehrere Sponsoren auf demselben Team = mehrere User, nicht ein User mit
    // mehreren Sponsor-Profilen.
    const sponsorUserId = `u_dg_s${i}`;
    await db.insert(users).values({ id: sponsorUserId, email: `dg-s${i}@example.com` });
    const [s] = await db
      .insert(sponsors)
      .values({ userId: sponsorUserId, displayName: `Sponsor ${i + 1}`, type: "familie" })
      .returning();
    sponsorIds.push(s.id);
    const [p] = await db
      .insert(pledges)
      .values({
        sponsorId: s.id,
        teamId: team.id,
        status: "active",
        startsAt: new Date("2025-08-01T00:00:00Z"),
        endsAt: new Date("2026-06-30T23:59:59Z"),
        // createdAt staffeln: Sponsor 1 ist der älteste.
        createdAt: new Date(base + i * 24 * 60 * 60 * 1000)
      })
      .returning();
    const ruleCount = i === 0 ? (opts.rulesForFirstSponsor ?? 1) : 1;
    for (let r = 0; r < ruleCount; r++) {
      await db.insert(pledgeRules).values({
        pledgeId: p.id,
        triggerType: "goal_total",
        triggerParamsJson: {},
        amountCents: 100 * (r + 1),
        requiresApproval: false,
        createdAt: new Date(base + i * 24 * 60 * 60 * 1000 + r * 60 * 1000)
      });
    }
  }
  return { teamId: team.id, sponsorIds };
}

describe.skipIf(isIntegrationDbDisabled)("enforceBasicDowngrade (A7)", () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("7 Sponsoren → die 2 neuesten werden pausiert (pausedAt gesetzt)", async () => {
    const db = await getTestDb();
    const { sponsorIds } = await seedClubWithSponsors({ sponsorCount: 7 });

    const result = await enforceBasicDowngrade("c_dg");

    expect(result.pausedPledges).toBe(2);

    const rows = await db
      .select({
        sponsorId: pledges.sponsorId,
        status: pledges.status,
        pausedAt: pledges.pausedAt
      })
      .from(pledges)
      .orderBy(asc(pledges.createdAt));

    // Die 5 ältesten bleiben aktiv …
    for (let i = 0; i < 5; i++) {
      expect(rows[i].status).toBe("active");
      expect(rows[i].pausedAt).toBeNull();
    }
    // … die 2 neuesten (Sponsor 6+7) sind pausiert MIT pausedAt.
    for (let i = 5; i < 7; i++) {
      expect(rows[i].status).toBe("paused");
      expect(rows[i].pausedAt).not.toBeNull();
      expect([sponsorIds[5], sponsorIds[6]]).toContain(rows[i].sponsorId);
    }
  });

  it("5 Regeln bei einem verbleibenden Sponsor → die 2 neuesten bekommen effectiveUntil", async () => {
    const db = await getTestDb();
    await seedClubWithSponsors({ sponsorCount: 2, rulesForFirstSponsor: 5 });

    const result = await enforceBasicDowngrade("c_dg");

    expect(result.deactivatedRules).toBe(2);

    const rules = await db
      .select({
        amountCents: pledgeRules.amountCents,
        effectiveUntil: pledgeRules.effectiveUntil
      })
      .from(pledgeRules)
      .orderBy(asc(pledgeRules.createdAt));

    // 5 Regeln Sponsor 1 + 1 Regel Sponsor 2.
    const firstSponsorRules = rules.slice(0, 5);
    expect(firstSponsorRules.slice(0, 3).every((r) => r.effectiveUntil === null)).toBe(true);
    expect(firstSponsorRules.slice(3).every((r) => r.effectiveUntil !== null)).toBe(true);
    expect(rules[5].effectiveUntil).toBeNull();
  });

  it("ist idempotent: zweiter Lauf (doppelter Webhook) ändert nichts mehr", async () => {
    await seedClubWithSponsors({ sponsorCount: 7, rulesForFirstSponsor: 5 });

    const first = await enforceBasicDowngrade("c_dg");
    expect(first.pausedPledges).toBe(2);
    expect(first.deactivatedRules).toBe(2);

    const second = await enforceBasicDowngrade("c_dg");
    expect(second.pausedPledges).toBe(0);
    expect(second.deactivatedRules).toBe(0);
  });

  it("unter den Caps → no-op, keine Mail", async () => {
    await seedClubWithSponsors({ sponsorCount: 3, rulesForFirstSponsor: 2 });

    const result = await enforceBasicDowngrade("c_dg");

    expect(result.pausedPledges).toBe(0);
    expect(result.deactivatedRules).toBe(0);
    expect(resend.emails.send).not.toHaveBeenCalled();
  });

  it("deckelt auch Sommerpause-pausierte Pledges (Juni-Downgrade, Review-Befund A7)", async () => {
    const db = await getTestDb();
    const { sponsorIds } = await seedClubWithSponsors({ sponsorCount: 6 });
    // Sommerpause-Zustand: alle Pledges paused mit Flag (chargen weiter).
    await db
      .update(pledges)
      .set({ status: "paused", sommerpausePaused: true });

    const result = await enforceBasicDowngrade("c_dg");

    expect(result.pausedPledges).toBe(1);
    const rows = await db
      .select({
        sponsorId: pledges.sponsorId,
        pausedAt: pledges.pausedAt,
        sommerpausePaused: pledges.sommerpausePaused
      })
      .from(pledges)
      .orderBy(asc(pledges.createdAt));
    // Der neueste Sponsor ist enforcement-pausiert: pausedAt gesetzt UND
    // Flag gelöscht — der 1.8.-Resume-Cron darf ihn nicht reaktivieren.
    const enforced = rows[5];
    expect(enforced.sponsorId).toBe(sponsorIds[5]);
    expect(enforced.pausedAt).not.toBeNull();
    expect(enforced.sommerpausePaused).toBe(false);
    // Die 5 ältesten bleiben Sommerpause-pausiert (chargen weiter).
    for (const row of rows.slice(0, 5)) {
      expect(row.sommerpausePaused).toBe(true);
      expect(row.pausedAt).toBeNull();
    }
  });

  it("informiert Club-Admins per Mail, wenn etwas pausiert wurde", async () => {
    await seedClubWithSponsors({ sponsorCount: 6 });

    await enforceBasicDowngrade("c_dg");

    expect(resend.emails.send).toHaveBeenCalledOnce();
    const arg = vi.mocked(resend.emails.send).mock.calls[0][0] as {
      to: string[];
      subject: string;
    };
    expect(arg.to).toContain("dg@example.com");
  });
});
