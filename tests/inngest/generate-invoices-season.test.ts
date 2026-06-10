/**
 * Regression: Saison-Charges (matchId=null) wurden nie fakturiert.
 *
 * `listConfirmedChargesByPeriod` machte einen innerJoin auf `matches` —
 * Saison-Charges aus evaluate-season (matchId=null, status='confirmed')
 * fielen damit für immer aus jeder Rechnung. Fix: leftJoin + Team/Club-Scope
 * über pledges.teamId, plus Fallback-Beschreibung ("Saison 2025/26 · Aufstieg")
 * im Rechnungslauf.
 *
 * Integration gegen die Docker-Test-DB (DATABASE_URL_TEST), gated wie
 * club-reporting.test.ts. Der Inngest-Handler wird direkt via `.fn` mit
 * Step-Stubs gefahren (Pattern aus season-renewal-prompts.test.ts); Mail,
 * Reply-To, PDF-Storage und Push sind gemockt — DB + PDF-Render sind echt.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const { resendSendMock } = vi.hoisted(() => ({
  resendSendMock: vi.fn().mockResolvedValue({ id: "stub-id", error: null })
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
  teams,
  sponsors,
  pledges,
  pledgeRules,
  matches,
  charges,
  invoices,
  invoiceItems
} from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import { db } from "@/lib/db/client";
import {
  listConfirmedChargesByPeriod,
  groupChargesBySponsorClub
} from "@/lib/db/queries/charges";
import { generateInvoices } from "@/lib/inngest/functions/generate-invoices";
import { formatSaisonLabel } from "@/lib/utils/saison";

// ───────────────────────── Pure: Saison-Label ──────────────────────────

describe("formatSaisonLabel (pure)", () => {
  it("kompakter Code '2526' → 'Saison 2025/26'", () => {
    expect(formatSaisonLabel("2526")).toBe("Saison 2025/26");
  });
  it("Slash-Format '2025/26' bleibt 'Saison 2025/26'", () => {
    expect(formatSaisonLabel("2025/26")).toBe("Saison 2025/26");
  });
  it("Langform '2025/2026' → 'Saison 2025/26'", () => {
    expect(formatSaisonLabel("2025/2026")).toBe("Saison 2025/26");
  });
  it("null → 'Saison' (kein Crash)", () => {
    expect(formatSaisonLabel(null)).toBe("Saison");
  });
  it("unbekanntes Format → raw mit Prefix", () => {
    expect(formatSaisonLabel("Herbst-25")).toBe("Saison Herbst-25");
  });
});

// ───────────────────────── Inngest-Stubs ──────────────────────────

function createStepStub() {
  return {
    run: async <T>(_label: string, fn: () => Promise<T> | T): Promise<T> => {
      return await fn();
    }
  };
}

function createLoggerStub() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

async function runInvoiceJob(period: string) {
  const fn = (generateInvoices as unknown as {
    fn: (ctx: {
      step: ReturnType<typeof createStepStub>;
      logger: ReturnType<typeof createLoggerStub>;
      event: { data: { period: string } };
    }) => Promise<{ invoicesCreated: number; groups: number }>;
  }).fn;
  return fn({
    step: createStepStub(),
    logger: createLoggerStub(),
    event: { data: { period } }
  });
}

// ───────────────────────── Seed ──────────────────────────
//
// Saison 2025/26 endet im Mai 2026: evaluate-season bestätigt am 20.05. eine
// Aufstiegs-Charge (matchId=null). Daneben eine normale Match-Charge im Mai
// und eine Saison-Charge aus dem April (Vormonat, darf NICHT auf die
// Mai-Rechnung). Der Rechnungslauf am 1. Juni fakturiert Periode "2026-05".

const SEASON_CHARGE_ID = "ch_season_may";
const MATCH_CHARGE_ID = "ch_match_may";
const APRIL_CHARGE_ID = "ch_season_april";

async function seed() {
  const tdb = await getTestDb();

  await tdb.insert(clubs).values({
    id: "club_1",
    slug: "fc-test",
    name: "FC Test",
    isSmallBusiness: true,
    verifiedAt: new Date(Date.UTC(2026, 0, 1))
  });
  await tdb.insert(teams).values({
    id: "team_1",
    clubId: "club_1",
    name: "Erste Mannschaft",
    saison: "2526"
  });
  await tdb.insert(users).values({
    id: "u_sp",
    name: "Sponsor",
    email: "sponsor@example.com",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date()
  });
  await tdb.insert(sponsors).values({
    id: "sp_1",
    userId: "u_sp",
    displayName: "Sponsor 1",
    type: "familie"
  });
  await tdb.insert(pledges).values({
    id: "pl_1",
    sponsorId: "sp_1",
    teamId: "team_1",
    status: "active",
    startsAt: new Date(Date.UTC(2025, 6, 1)),
    endsAt: new Date(Date.UTC(2026, 5, 30))
  });
  await tdb.insert(pledgeRules).values([
    {
      id: "pr_season",
      pledgeId: "pl_1",
      triggerType: "season_promotion",
      amountCents: 5000,
      requiresApproval: false
    },
    {
      id: "pr_season_2",
      pledgeId: "pl_1",
      triggerType: "season_champion",
      amountCents: 2000,
      requiresApproval: false
    },
    {
      id: "pr_match",
      pledgeId: "pl_1",
      triggerType: "goal_total",
      amountCents: 500,
      requiresApproval: false
    }
  ]);

  await tdb.insert(matches).values({
    id: "m_1",
    teamId: "team_1",
    fussballdeSpielId: "fs_inv_1",
    datum: new Date(Date.UTC(2026, 4, 10, 13, 0)),
    heimName: "FC Test",
    gastName: "SV Gegner",
    ergebnisHeim: 2,
    ergebnisGast: 1,
    status: "finished"
  });

  await tdb.insert(charges).values([
    // Saison-Charge wie evaluate-season sie schreibt: matchId=null + saison
    {
      id: SEASON_CHARGE_ID,
      pledgeId: "pl_1",
      pledgeRuleId: "pr_season",
      matchId: null,
      saison: "2526",
      triggerType: "season_promotion",
      amountCents: 5000,
      status: "confirmed",
      confirmedAt: new Date(Date.UTC(2026, 4, 20, 12, 0))
    },
    // Normale Match-Charge im selben Monat (Regression: bleibt drauf)
    {
      id: MATCH_CHARGE_ID,
      pledgeId: "pl_1",
      pledgeRuleId: "pr_match",
      matchId: "m_1",
      triggerType: "goal_total",
      amountCents: 500,
      status: "confirmed",
      confirmedAt: new Date(Date.UTC(2026, 4, 10, 15, 0))
    },
    // Saison-Charge aus dem Vormonat — gehört NICHT auf die Mai-Rechnung
    {
      id: APRIL_CHARGE_ID,
      pledgeId: "pl_1",
      pledgeRuleId: "pr_season_2",
      matchId: null,
      saison: "2526",
      triggerType: "season_champion",
      amountCents: 2000,
      status: "confirmed",
      confirmedAt: new Date(Date.UTC(2026, 3, 10, 12, 0))
    }
  ]);
}

// ───────────────────────── Tests ──────────────────────────

describe.skipIf(isIntegrationDbDisabled)("Saison-Charges im Rechnungslauf (integration)", () => {
  beforeEach(async () => {
    resendSendMock.mockClear();
    await resetTestDb();
    await seed();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("listConfirmedChargesByPeriod liefert Saison-Charges (matchId=null) mit Club-Scope", async () => {
    const rows = await listConfirmedChargesByPeriod({
      periodStart: new Date(Date.UTC(2026, 4, 1)),
      periodEnd: new Date(Date.UTC(2026, 4, 31, 23, 59, 59))
    });

    expect(rows.map((r) => r.chargeId).sort()).toEqual(
      [MATCH_CHARGE_ID, SEASON_CHARGE_ID].sort()
    );

    const season = rows.find((r) => r.chargeId === SEASON_CHARGE_ID)!;
    expect(season.clubId).toBe("club_1");
    expect(season.sponsorId).toBe("sp_1");
    expect(season.saison).toBe("2526");
    expect(season.matchDate).toBeNull();

    // beide landen in derselben (sponsor, club)-Gruppe = eine Rechnung
    const grouped = groupChargesBySponsorClub(rows);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].items).toHaveLength(2);
  });

  it("bestätigte Saison-Charge landet auf der Folgemonats-Rechnung", async () => {
    const result = await runInvoiceJob("2026-05");
    expect(result.invoicesCreated).toBe(1);

    const [inv] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.period, "2026-05"));
    expect(inv).toBeDefined();
    expect(inv.sponsorId).toBe("sp_1");
    expect(inv.clubId).toBe("club_1");
    // Kleinunternehmer → keine USt: 5000 (Saison) + 500 (Match)
    expect(inv.totalCents).toBe(5500);

    const items = await db
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, inv.id));
    expect(items).toHaveLength(2);

    const seasonItem = items.find((i) => i.chargeId === SEASON_CHARGE_ID);
    expect(seasonItem).toBeDefined();
    expect(seasonItem!.description).toBe("Saison 2025/26 · Aufstieg");
    expect(seasonItem!.amountCents).toBe(5000);

    // Saison-Charge ist jetzt fakturiert
    const [seasonCharge] = await db
      .select()
      .from(charges)
      .where(eq(charges.id, SEASON_CHARGE_ID));
    expect(seasonCharge.status).toBe("invoiced");
    expect(seasonCharge.invoiceId).toBe(inv.id);

    // Vormonats-Saison-Charge bleibt unfakturiert (falsche Periode)
    const [aprilCharge] = await db
      .select()
      .from(charges)
      .where(eq(charges.id, APRIL_CHARGE_ID));
    expect(aprilCharge.status).toBe("confirmed");
    expect(aprilCharge.invoiceId).toBeNull();
  });
});
