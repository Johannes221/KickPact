/**
 * Idempotenz der Pledge-Erstellung (Launch-Blocker Go-Live 2026-07-10).
 *
 * Broadcast-Sponsor-Invites sind jetzt mehrfach einlösbar (EIN Link → viele
 * Sponsoren). Das alte single-use-`markInvitationUsed`-Gate, das einen
 * Doppelklick-Doppel-Pledge verhinderte, fällt für sie weg. Der Schutz gegen
 * ZWEI Pledges aus EINEM Submit hängt jetzt am partiellen Unique-Index
 * (sponsor_id, idempotency_key): `createPledgeWithRules` löst eine Kollision
 * idempotent zum bereits angelegten Pledge auf, statt einen zweiten zu erzeugen.
 *
 * Bewusst am ECHTEN Postgres-Index getestet (nicht gemockt) — das ist eine
 * Geld-Pfad-Invariante (Doppel-Abrechnung die ganze Saison).
 */
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users, clubs, teams, sponsors, pledges, pledgeRules } from "@/lib/db/schema";
import { createPledgeWithRules } from "@/lib/db/queries/pledges";
import { createSponsorProfile } from "@/lib/db/queries/sponsor-dashboard";
import {
  getTestDb,
  resetTestDb,
  closeTestDb,
  isIntegrationDbDisabled
} from "../setup/integration-db";

async function seed(): Promise<{ sponsorId: string; teamId: string }> {
  const tdb = await getTestDb();
  const userId = createId();
  await tdb.insert(users).values({ id: userId, email: `s-${userId}@kickpact.local` });
  const clubId = createId();
  await tdb.insert(clubs).values({ id: clubId, slug: `c-${clubId.slice(0, 6)}`, name: "FC Idem" });
  const [t] = await tdb
    .insert(teams)
    .values({ clubId, name: "Herren 1", saison: "2526", isActive: true })
    .returning();
  const [s] = await tdb
    .insert(sponsors)
    .values({ userId, displayName: "Onkel Theo", type: "familie" })
    .returning();
  return { sponsorId: s.id, teamId: t.id };
}

function pledgeArgs(sponsorId: string, teamId: string, idempotencyKey: string | null) {
  return {
    pledge: {
      sponsorId,
      teamId,
      status: "active" as const,
      startsAt: new Date("2026-01-01"),
      endsAt: new Date("2099-12-31"),
      monthlyCapCents: null,
      idempotencyKey
    },
    rules: [
      {
        triggerType: "goal_total" as const,
        triggerParamsJson: {},
        amountCents: 500,
        requiresApproval: false
      }
    ]
  };
}

async function countPledges(sponsorId: string): Promise<number> {
  const tdb = await getTestDb();
  const [r] = await tdb
    .select({ v: count() })
    .from(pledges)
    .where(eq(pledges.sponsorId, sponsorId));
  return r?.v ?? 0;
}

describe.skipIf(isIntegrationDbDisabled)("createPledgeWithRules — Idempotenz", () => {
  beforeEach(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("gleicher (sponsorId, idempotencyKey) → EIN Pledge, zweiter Aufruf liefert dieselbe pledgeId", async () => {
    const { sponsorId, teamId } = await seed();
    const args = pledgeArgs(sponsorId, teamId, "idem-double-click");

    const first = await createPledgeWithRules(args);
    const second = await createPledgeWithRules(args);

    // Idempotent: KEIN Wurf, dieselbe Pledge zurück.
    expect(second.pledgeId).toBe(first.pledgeId);
    // Nur EIN Pledge + EINE Rule (nicht doppelt) — kein Doppel-Charge-Risiko.
    expect(await countPledges(sponsorId)).toBe(1);
    const [rc] = await db
      .select({ v: count() })
      .from(pledgeRules)
      .where(eq(pledgeRules.pledgeId, first.pledgeId));
    expect(rc?.v ?? 0).toBe(1);
  });

  it("verschiedene idempotencyKeys, gleicher Sponsor+Team → ZWEI Pledges (Zweit-Pact erlaubt)", async () => {
    const { sponsorId, teamId } = await seed();

    const a = await createPledgeWithRules(pledgeArgs(sponsorId, teamId, "idem-a"));
    const b = await createPledgeWithRules(pledgeArgs(sponsorId, teamId, "idem-b"));

    expect(b.pledgeId).not.toBe(a.pledgeId);
    expect(await countPledges(sponsorId)).toBe(2);
  });

  it("NULL idempotencyKey kollidiert nicht (Alt-Rows/Saison-Klone bleiben erlaubt)", async () => {
    const { sponsorId, teamId } = await seed();

    await createPledgeWithRules(pledgeArgs(sponsorId, teamId, null));
    await createPledgeWithRules(pledgeArgs(sponsorId, teamId, null));

    expect(await countPledges(sponsorId)).toBe(2);
  });
});

describe.skipIf(isIntegrationDbDisabled)("createSponsorProfile — idempotent pro User (K1)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("zweiter Aufruf für denselben User liefert dasselbe Profil, keine Zweit-Row", async () => {
    const tdb = await getTestDb();
    const userId = createId();
    await tdb.insert(users).values({ id: userId, email: `k1-${userId}@kickpact.local` });

    // Simuliert den Erst-Pact-Race: beide Submits sehen findSponsorForUser=null
    // und legen an. Ohne Unique+Upsert entstünden zwei sponsorIds → der Pledge-
    // Idempotenz-Index griffe nicht → Doppel-Abrechnung.
    const first = await createSponsorProfile({ userId, displayName: "A", type: "familie" });
    const second = await createSponsorProfile({ userId, displayName: "B", type: "familie" });

    expect(second.id).toBe(first.id);
    const [c] = await tdb
      .select({ v: count() })
      .from(sponsors)
      .where(eq(sponsors.userId, userId));
    expect(c?.v ?? 0).toBe(1);
  });
});
