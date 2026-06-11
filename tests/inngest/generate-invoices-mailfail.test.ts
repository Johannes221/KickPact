/**
 * Rechnungsversand-Fehler dürfen nicht verschluckt werden
 * (Audit 2026-06-11 / Phase 2 / B6).
 *
 * Vorher: Invoice wurde sofort mit status='sent' angelegt, der Mail-Fehler
 * landete im per-Group try/catch → Inngest sah Erfolg, kein Retry, Sponsor
 * bekam nie eine Rechnung (sah aber in der DB wie versendet aus).
 *
 * Neu:
 * 1. Invoice startet als 'draft'; 'sent' + sentAt erst NACH Mail-Erfolg.
 * 2. Mail-Fehler propagieren aus dem Handler (Inngest-Retry).
 * 3. Ein Re-Run nach Mail-Fehler erkennt den liegengebliebenen Draft
 *    (Unique-Konflikt) und holt Versand + sent-Markierung nach.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { resendSendMock } = vi.hoisted(() => ({
  resendSendMock: vi.fn()
}));

vi.mock("@/lib/mail/client", () => ({
  resend: { emails: { send: resendSendMock } },
  MAIL_FROM: "KickPact <stub@test.local>"
}));
vi.mock("@/lib/mail/reply-to", () => ({
  getReplyToForClub: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("@/lib/invoicing/storage", () => ({
  storePdf: vi.fn().mockResolvedValue("local://test/invoice.pdf")
}));
vi.mock("@/lib/notifications/deliver", () => ({
  notifyUsers: vi.fn().mockResolvedValue(undefined)
}));

import { eq } from "drizzle-orm";
import {
  users,
  clubs,
  clubMemberships,
  teams,
  sponsors,
  pledges,
  pledgeRules,
  matches,
  charges,
  invoices
} from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import { generateInvoices } from "@/lib/inngest/functions/generate-invoices";

function createStepStub() {
  return {
    run: async <T>(_label: string, fn: () => Promise<T> | T): Promise<T> => fn()
  };
}

async function runInvoiceJob(period: string) {
  const fn = (generateInvoices as unknown as {
    fn: (ctx: {
      step: ReturnType<typeof createStepStub>;
      logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
      event: { data: { period: string } };
    }) => Promise<{ invoicesCreated: number; mailsSent: number }>;
  }).fn;
  return fn({
    step: createStepStub(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    event: { data: { period } }
  });
}

async function seed() {
  const tdb = await getTestDb();
  await tdb.insert(clubs).values({
    id: "club_mf",
    slug: "mf-fc",
    name: "Mailfail FC",
    isSmallBusiness: true,
    verifiedAt: new Date(Date.UTC(2026, 0, 1))
  });
  await tdb.insert(teams).values({
    id: "team_mf",
    clubId: "club_mf",
    name: "Erste",
    saison: "2526"
  });
  await tdb.insert(users).values([
    {
      id: "u_mf_sponsor",
      name: "Sponsor",
      email: "sponsor-mf@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: "u_mf_admin",
      name: "Admin",
      email: "admin-mf@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ]);
  await tdb.insert(clubMemberships).values({
    clubId: "club_mf",
    userId: "u_mf_admin",
    role: "admin"
  });
  await tdb.insert(sponsors).values({
    id: "sp_mf",
    userId: "u_mf_sponsor",
    displayName: "Sponsor MF",
    type: "familie"
  });
  await tdb.insert(pledges).values({
    id: "pl_mf",
    sponsorId: "sp_mf",
    teamId: "team_mf",
    status: "active",
    startsAt: new Date(Date.UTC(2025, 6, 1)),
    endsAt: new Date(Date.UTC(2026, 5, 30))
  });
  await tdb.insert(pledgeRules).values({
    id: "pr_mf",
    pledgeId: "pl_mf",
    triggerType: "goal_total",
    amountCents: 500,
    requiresApproval: false
  });
  await tdb.insert(matches).values({
    id: "m_mf",
    teamId: "team_mf",
    fussballdeSpielId: "fs_mf_1",
    datum: new Date(Date.UTC(2026, 4, 10, 13, 0)),
    heimName: "Mailfail FC",
    gastName: "SV Gegner",
    ergebnisHeim: 1,
    ergebnisGast: 0,
    status: "finished"
  });
  await tdb.insert(charges).values({
    id: "ch_mf",
    pledgeId: "pl_mf",
    pledgeRuleId: "pr_mf",
    matchId: "m_mf",
    triggerType: "goal_total",
    amountCents: 500,
    status: "confirmed",
    confirmedAt: new Date(Date.UTC(2026, 4, 10, 15, 0))
  });
}

describe.skipIf(isIntegrationDbDisabled)("generate-invoices Mail-Fehler (B6)", () => {
  beforeEach(async () => {
    await resetTestDb();
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("Mail-Fehler propagiert (Inngest-Retry) und Invoice bleibt 'draft'", async () => {
    await seed();
    resendSendMock.mockResolvedValue({ error: { message: "smtp down" } });

    await expect(runInvoiceJob("2026-05")).rejects.toThrow(/mail/i);

    const tdb = await getTestDb();
    const [inv] = await tdb
      .select()
      .from(invoices)
      .where(eq(invoices.sponsorId, "sp_mf"));
    expect(inv).toBeDefined();
    expect(inv.status).toBe("draft");
    expect(inv.sentAt).toBeNull();
  });

  it("Re-Run nach Mail-Fehler holt Versand nach und markiert 'sent'", async () => {
    await seed();
    resendSendMock.mockResolvedValue({ error: { message: "smtp down" } });
    await expect(runInvoiceJob("2026-05")).rejects.toThrow();

    // Mail-Provider wieder gesund → Re-Run derselben Periode.
    resendSendMock.mockResolvedValue({ id: "mail-ok", error: null });
    const result = await runInvoiceJob("2026-05");

    const tdb = await getTestDb();
    const [inv] = await tdb
      .select()
      .from(invoices)
      .where(eq(invoices.sponsorId, "sp_mf"));
    expect(inv.status).toBe("sent");
    expect(inv.sentAt).not.toBeNull();
    expect(result.mailsSent).toBeGreaterThan(0);
    // Sponsor-Mail wurde im Re-Run wirklich versendet.
    const sponsorMails = resendSendMock.mock.calls.filter(
      (c) => (c[0] as { to: string | string[] }).to === "sponsor-mf@example.com"
    );
    expect(sponsorMails.length).toBeGreaterThan(0);
  });

  it("Erfolgsfall: Invoice wird erst nach Mail-Erfolg 'sent'", async () => {
    await seed();
    resendSendMock.mockResolvedValue({ id: "mail-ok", error: null });

    const result = await runInvoiceJob("2026-05");

    expect(result.invoicesCreated).toBe(1);
    const tdb = await getTestDb();
    const [inv] = await tdb
      .select()
      .from(invoices)
      .where(eq(invoices.sponsorId, "sp_mf"));
    expect(inv.status).toBe("sent");
    expect(inv.sentAt).not.toBeNull();
  });
});
