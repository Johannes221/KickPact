/**
 * Regression: Pause-Marker-Lebenszyklus (Audit 2026-06-11, Phase 1).
 *
 *  - setPledgeStatus("paused") muss pausedAt stempeln (faire Abrechnung
 *    bereits gespielter Spiele, siehe evaluation.ts).
 *  - setPledgeStatus("active") muss BEIDE Pause-Marker zurücksetzen — sonst
 *    überspringt der nächste Sommerpause-Cron (filtert sommerpausePaused=false)
 *    den Pledge für immer (Flag-Leiche).
 *  - endExpiredPledges muss auch PAUSIERTE Pledges nach endsAt beenden —
 *    vorher blieben pausierte Pledges ewig "paused" (unerreichbarer Zustand).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createId } from "@paralleldrive/cuid2";

const { mockUserId } = vi.hoisted(() => ({
  mockUserId: { current: "" }
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockImplementation(async () => ({
    id: mockUserId.current,
    email: `${mockUserId.current}@kickpact.local`
  }))
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

import { db } from "@/lib/db/client";
import { users, clubs, teams, sponsors, pledges } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resetTestDb } from "../setup/db";
import { setPledgeStatus } from "@/lib/actions/pledges";
import { endExpiredPledges } from "@/lib/db/queries/pledges";

async function seedPledge(opts: {
  status: "active" | "paused" | "ended";
  sommerpausePaused?: boolean;
  pausedAt?: Date | null;
  endsAt?: Date;
}): Promise<string> {
  const userId = createId();
  mockUserId.current = userId;
  await db.insert(users).values({ id: userId, email: `${userId}@kickpact.local` });
  const clubId = createId();
  await db.insert(clubs).values({ id: clubId, slug: `club-${clubId}`, name: "Status FC" });
  const [t] = await db
    .insert(teams)
    .values({
      clubId,
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: `TEAM_${clubId}`,
      fussballdeSlug: `status-fc-${clubId}`,
      isActive: true
    })
    .returning();
  const [s] = await db
    .insert(sponsors)
    .values({ userId, displayName: "Tante Resi", type: "familie" })
    .returning();
  const [p] = await db
    .insert(pledges)
    .values({
      sponsorId: s.id,
      teamId: t.id,
      status: opts.status,
      sommerpausePaused: opts.sommerpausePaused ?? false,
      pausedAt: opts.pausedAt ?? null,
      startsAt: new Date("2025-08-01T00:00:00Z"),
      endsAt: opts.endsAt ?? new Date("2026-06-30T23:59:59Z")
    })
    .returning();
  return p.id;
}

async function getPledgeRow(id: string) {
  const [row] = await db.select().from(pledges).where(eq(pledges.id, id)).limit(1);
  return row;
}

describe("setPledgeStatus — Pause-Marker", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("stempelt pausedAt beim manuellen Pausieren", async () => {
    const id = await seedPledge({ status: "active" });
    const res = await setPledgeStatus(id, "paused");
    expect(res.error).toBeUndefined();
    const row = await getPledgeRow(id);
    expect(row.status).toBe("paused");
    expect(row.pausedAt).not.toBeNull();
  });

  it("setzt sommerpausePaused UND pausedAt beim Reaktivieren zurück", async () => {
    const id = await seedPledge({
      status: "paused",
      sommerpausePaused: true
    });
    const res = await setPledgeStatus(id, "active");
    expect(res.error).toBeUndefined();
    const row = await getPledgeRow(id);
    expect(row.status).toBe("active");
    expect(row.sommerpausePaused).toBe(false);
    expect(row.pausedAt).toBeNull();
  });

  it("setzt pausedAt nach manueller Pause beim Reaktivieren zurück", async () => {
    const id = await seedPledge({
      status: "paused",
      pausedAt: new Date("2026-06-06T10:00:00Z")
    });
    await setPledgeStatus(id, "active");
    const row = await getPledgeRow(id);
    expect(row.pausedAt).toBeNull();
  });
});

describe("endExpiredPledges", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("beendet aktive UND pausierte Pledges nach endsAt, lässt laufende stehen", async () => {
    const past = new Date("2026-05-31T23:59:59Z");
    const future = new Date("2027-06-30T23:59:59Z");
    const expiredActive = await seedPledge({ status: "active", endsAt: past });
    const expiredPaused = await seedPledge({
      status: "paused",
      sommerpausePaused: true,
      endsAt: past
    });
    const running = await seedPledge({ status: "active", endsAt: future });

    const ended = await endExpiredPledges(new Date("2026-06-11T12:00:00Z"));

    expect(ended.map((e) => e.id).sort()).toEqual(
      [expiredActive, expiredPaused].sort()
    );
    expect((await getPledgeRow(expiredActive)).status).toBe("ended");
    expect((await getPledgeRow(expiredPaused)).status).toBe("ended");
    expect((await getPledgeRow(running)).status).toBe("active");
  });
});
