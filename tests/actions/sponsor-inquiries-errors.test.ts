/**
 * A8 (Phase 4 / Sponsor-Journey): Inquiry-Actions geben Fehler als
 * `{ ok: false, message }` zurück statt zu werfen.
 *
 * Hintergrund: Next.js redacted aus Server-Actions geworfene Errors in
 * Production zur generischen Meldung — die deutsche Klartext-Ursache
 * (Rate-Limit, Duplikat, nicht discoverable, …) ging im Client-Toast verloren.
 * Pattern: create-pledge.ts.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUserId } = vi.hoisted(() => ({ mockUserId: { current: "u_inq" } }));

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockImplementation(async () => ({
    id: mockUserId.current,
    email: `${mockUserId.current}@kickpact.local`,
    name: "Inquiry Tester"
  }))
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/mail/client", () => ({
  resend: { emails: { send: vi.fn().mockResolvedValue({ id: "stub" }) } },
  MAIL_FROM: "KickPact <stub@test.local>"
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) }
}));

import { eq } from "drizzle-orm";
import {
  users,
  clubs,
  clubMemberships,
  teams,
  sponsorInquiries
} from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import {
  createSponsorInquiry,
  respondToInquiry
} from "@/lib/actions/sponsor-inquiries";

async function seedBase(opts?: { discoverable?: boolean }) {
  const db = await getTestDb();
  await db.insert(users).values([
    { id: "u_inq", email: "u_inq@kickpact.local", name: "Sponsor" },
    { id: "u_admin", email: "u_admin@kickpact.local", name: "Admin" }
  ]);
  await db.insert(clubs).values({ id: "c_inq", slug: "inq-fc", name: "Inquiry FC" });
  await db
    .insert(clubMemberships)
    .values({ clubId: "c_inq", userId: "u_admin", role: "admin" });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: "c_inq",
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: "TEAM_INQ",
      isActive: true,
      discoverable: opts?.discoverable ?? true
    })
    .returning();
  return { teamId: team.id };
}

afterAll(async () => {
  await closeTestDb();
});

describe.skipIf(isIntegrationDbDisabled)("createSponsorInquiry — {ok,message}", () => {
  beforeEach(async () => {
    mockUserId.current = "u_inq";
    await resetTestDb();
  });

  it("unbekannte Mannschaft → ok:false mit Klartext-Message (kein Throw)", async () => {
    await seedBase();
    const res = await createSponsorInquiry({ teamId: "does-not-exist" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/nicht gefunden/i);
  });

  it("nicht-discoverable Mannschaft → ok:false mit Message", async () => {
    const { teamId } = await seedBase({ discoverable: false });
    const res = await createSponsorInquiry({ teamId });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/keine direkten Anfragen/i);
  });

  it("doppelte offene Anfrage → ok:false mit Message", async () => {
    const { teamId } = await seedBase();
    const first = await createSponsorInquiry({ teamId });
    expect(first.ok).toBe(true);
    const second = await createSponsorInquiry({ teamId });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.message).toMatch(/bereits eine offene Anfrage/i);
  });

  it("Happy Path → ok:true + Inquiry-Zeile existiert", async () => {
    const db = await getTestDb();
    const { teamId } = await seedBase();
    const res = await createSponsorInquiry({ teamId, message: "Hi!" });
    expect(res).toEqual({ ok: true });
    const rows = await db
      .select()
      .from(sponsorInquiries)
      .where(eq(sponsorInquiries.teamId, teamId));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("pending");
  });
});

describe.skipIf(isIntegrationDbDisabled)("respondToInquiry — {ok,message}", () => {
  beforeEach(async () => {
    mockUserId.current = "u_inq";
    await resetTestDb();
  });

  it("unbekannte Anfrage → ok:false (kein Throw)", async () => {
    await seedBase();
    mockUserId.current = "u_admin";
    const res = await respondToInquiry({ inquiryId: "nope", accept: false });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/nicht gefunden/i);
  });

  it("nicht berechtigter User → ok:false mit Message", async () => {
    const db = await getTestDb();
    const { teamId } = await seedBase();
    const [inq] = await db
      .insert(sponsorInquiries)
      .values({ sponsorUserId: "u_inq", teamId, status: "pending" })
      .returning();
    // u_inq ist Sponsor, kein Team-/Club-Admin
    const res = await respondToInquiry({ inquiryId: inq.id, accept: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/nicht berechtigt/i);
  });

  it("bereits beantwortete Anfrage → ok:false mit Message", async () => {
    const db = await getTestDb();
    const { teamId } = await seedBase();
    const [inq] = await db
      .insert(sponsorInquiries)
      .values({ sponsorUserId: "u_inq", teamId, status: "rejected" })
      .returning();
    mockUserId.current = "u_admin";
    const res = await respondToInquiry({ inquiryId: inq.id, accept: false });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toMatch(/bereits beantwortet/i);
  });

  it("Ablehnen (Happy Path) → ok:true", async () => {
    const db = await getTestDb();
    const { teamId } = await seedBase();
    const [inq] = await db
      .insert(sponsorInquiries)
      .values({ sponsorUserId: "u_inq", teamId, status: "pending" })
      .returning();
    mockUserId.current = "u_admin";
    const res = await respondToInquiry({
      inquiryId: inq.id,
      accept: false,
      responseMessage: "Leider nein."
    });
    expect(res).toEqual({ ok: true });
    const [row] = await db
      .select()
      .from(sponsorInquiries)
      .where(eq(sponsorInquiries.id, inq.id));
    expect(row.status).toBe("rejected");
  });
});
