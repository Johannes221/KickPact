/**
 * Paket B (Phase 5) — Lizenz-Flip-Cron `apply-license-transfers` (Spec §1.5).
 *
 * Integration gegen die Test-DB. Der Inngest-Handler läuft direkt via `.fn`
 * mit Step-Stubs (Pattern generate-invoices-season.test.ts).
 *
 * Abgedeckt:
 *   - fälliger accepted-Request → team_licenses wird an die Vereins-
 *     Subscription/Master-License umgehängt (getTeamLicensePlan = 'verein')
 *   - Idempotenz: zweiter Lauf ist No-Op (skipped, keine Änderung)
 *   - nicht fällige (effectiveAt in Zukunft) + pending Requests bleiben
 *     unangetastet
 *   - fehlende team_licenses-Row → wird auflösbar angelegt
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  clubs,
  teams,
  users,
  subscriptions,
  teamLicenses,
  teamLicenseTransferRequests
} from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import { applyLicenseTransfers } from "@/lib/inngest/functions/apply-license-transfers";
import { getTeamLicensePlan } from "@/lib/db/queries/pledges";

function createStepStub() {
  return {
    run: async <T>(_label: string, fn: () => Promise<T> | T): Promise<T> => fn()
  };
}

async function runCron() {
  const fn = (applyLicenseTransfers as unknown as {
    fn: (ctx: {
      step: ReturnType<typeof createStepStub>;
      logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
    }) => Promise<{ due: number; flipped: number; skipped: number }>;
  }).fn;
  return fn({
    step: createStepStub(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  });
}

async function seed() {
  const tdb = await getTestDb();

  await tdb.insert(users).values([
    { id: "u_trainer", email: "trainer@x.de" },
    { id: "u_vorstand", email: "vorstand@y.de" }
  ]);

  await tdb.insert(clubs).values([
    { id: "club_y", slug: "verein-y", name: "SV Y", fussballdeVereinId: "fv" },
    { id: "club_x", slug: "container-x", name: "SV Y — Erste", fussballdeVereinId: "fv" }
  ]);

  await tdb.insert(teams).values([
    { id: "team_y1", clubId: "club_y", name: "Erste (Verein)", saison: "2526" },
    {
      id: "team_t1",
      clubId: "club_x",
      name: "Erste",
      saison: "2526",
      licensedUnderClubId: "club_y" // Branding-Flip ist bei Annahme passiert
    }
  ]);

  await tdb.insert(subscriptions).values([
    { clubId: "club_y", status: "active" },
    { clubId: "club_x", status: "active", stripeSubscriptionId: "sub_t1" }
  ]);

  await tdb.insert(teamLicenses).values([
    {
      id: "lic_master_y",
      subscriptionClubId: "club_y",
      teamId: "team_y1",
      plan: "verein",
      status: "active"
    },
    {
      id: "lic_t1",
      subscriptionClubId: "club_x",
      teamId: "team_t1",
      plan: "pro",
      status: "active"
    }
  ]);
}

async function seedRequest(opts: { effectiveAt: Date; status?: "accepted" | "pending" }) {
  const tdb = await getTestDb();
  const [row] = await tdb
    .insert(teamLicenseTransferRequests)
    .values({
      teamId: "team_t1",
      toClubId: "club_y",
      fromUserId: "u_trainer",
      requestedByUserId: "u_vorstand",
      status: opts.status ?? "accepted",
      decision: opts.status === "pending" ? null : "accept_license",
      decidedAt: opts.status === "pending" ? null : new Date(),
      decidedByUserId: opts.status === "pending" ? null : "u_trainer",
      effectiveAt: opts.effectiveAt
    })
    .returning();
  return row;
}

describe.skipIf(isIntegrationDbDisabled)("apply-license-transfers cron", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seed();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("hängt die Lizenz eines fälligen accepted-Requests um", async () => {
    await seedRequest({ effectiveAt: new Date(Date.now() - 60_000) });

    const result = await runCron();
    expect(result).toMatchObject({ due: 1, flipped: 1, skipped: 0 });

    const tdb = await getTestDb();
    const [lic] = await tdb
      .select()
      .from(teamLicenses)
      .where(eq(teamLicenses.teamId, "team_t1"));
    expect(lic.subscriptionClubId).toBe("club_y");
    expect(lic.parentClubLicenseId).toBe("lic_master_y");
    expect(lic.plan).toBe("verein");
    expect(await getTeamLicensePlan("team_t1")).toBe("verein");
  });

  it("zweiter Lauf ist No-Op (idempotent)", async () => {
    await seedRequest({ effectiveAt: new Date(Date.now() - 60_000) });
    await runCron();

    const tdb = await getTestDb();
    const before = await tdb
      .select()
      .from(teamLicenses)
      .where(eq(teamLicenses.teamId, "team_t1"));

    const second = await runCron();
    expect(second).toMatchObject({ due: 1, flipped: 0, skipped: 1 });

    const after = await tdb
      .select()
      .from(teamLicenses)
      .where(eq(teamLicenses.teamId, "team_t1"));
    expect(after).toEqual(before);
  });

  it("nicht fällige und pending Requests bleiben unangetastet", async () => {
    await seedRequest({ effectiveAt: new Date(Date.now() + 86_400_000) });

    const result = await runCron();
    expect(result).toMatchObject({ due: 0, flipped: 0 });

    const tdb = await getTestDb();
    const [lic] = await tdb
      .select()
      .from(teamLicenses)
      .where(eq(teamLicenses.teamId, "team_t1"));
    expect(lic.subscriptionClubId).toBe("club_x");
    expect(lic.plan).toBe("pro");
  });

  it("legt fehlende team_licenses-Row auflösbar an", async () => {
    const tdb = await getTestDb();
    await tdb.delete(teamLicenses).where(eq(teamLicenses.teamId, "team_t1"));
    await seedRequest({ effectiveAt: new Date(Date.now() - 60_000) });

    const result = await runCron();
    expect(result).toMatchObject({ due: 1, flipped: 1 });
    expect(await getTeamLicensePlan("team_t1")).toBe("verein");
  });
});
