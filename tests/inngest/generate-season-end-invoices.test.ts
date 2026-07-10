/**
 * Paket A.4 (Spec 2026-05-26 §1.2) — Season-End-Rechnungslauf.
 *
 * Cron 1.7. 05:00 UTC (+ Test-Event `invoices/season-end-manual-run` mit
 * nowIso-Override): alle confirmed/nicht-invoiced Charges mit
 * snapshot='season_end' UND Sponsor AKTUELL season_end, deren
 * COALESCE(confirmedAt, createdAt) in [1.7. Vorjahr, 1.7.) liegt
 * → EINE Rechnung pro (Sponsor, Club) über die geteilte
 * Invoice-Builder-Infrastruktur (Nummernkreis, Withhold-Gate, PDF,
 * Mail an Sponsor + Vereins-Admins).
 *
 * Integration gegen die Docker-Test-DB; Handler via `.fn` mit Step-Stub
 * (Pattern aus generate-invoices-season.test.ts). Mail/Storage/Push gemockt.
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
  clubMemberships,
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
import { listSeasonEndChargesForWindow } from "@/lib/db/queries/charges";
import {
  generateSeasonEndInvoices,
  seasonWindowFor
} from "@/lib/inngest/functions/generate-season-end-invoices";

// ───────────────────────── Pure: Saison-Fenster ──────────────────────────

describe("seasonWindowFor (pure)", () => {
  it("Cron-Lauf 1.7.2026 → Saison 2025/26, Fenster [1.7.25, 1.7.26)", () => {
    const w = seasonWindowFor(new Date("2026-07-01T05:00:00Z"));
    expect(w.periodStr).toBe("2025/26");
    expect(w.periodLabel).toBe("Saison 2025/26");
    expect(w.invoiceYear).toBe(2026);
    expect(w.windowStart.toISOString()).toBe("2025-07-01T00:00:00.000Z");
    expect(w.windowEnd.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });

  it("manueller Re-Run im Dezember → gleiche (im Sommer abgelaufene) Saison", () => {
    const w = seasonWindowFor(new Date("2026-12-15T12:00:00Z"));
    expect(w.periodStr).toBe("2025/26");
  });

  it("manueller Re-Run im Frühjahr (Jan–Jun) → Vorjahres-Saisonende", () => {
    const w = seasonWindowFor(new Date("2027-03-01T12:00:00Z"));
    expect(w.periodStr).toBe("2025/26");
    expect(w.invoiceYear).toBe(2026);
  });
});

function createStepStub() {
  return {
    run: async <T>(_label: string, fn: () => Promise<T> | T): Promise<T> => fn()
  };
}
const loggerStub = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

async function runSeasonEndJob(nowIso?: string) {
  const fn = (generateSeasonEndInvoices as unknown as {
    fn: (ctx: {
      step: ReturnType<typeof createStepStub>;
      logger: typeof loggerStub;
      event: { data: { nowIso?: string } };
    }) => Promise<{ period: string; groups: number; invoicesCreated: number }>;
  }).fn;
  return fn({
    step: createStepStub(),
    logger: loggerStub,
    event: { data: nowIso ? { nowIso } : {} }
  });
}

// IDs
const SE_MATCH_CHARGE = "ch_se_match"; // Sept-Spiel, season_end-Snapshot
const SE_SEASON_CHARGE = "ch_se_season"; // Saison-Charge Juni, season_end-Snapshot
const MONTHLY_CHARGE = "ch_se_monthly"; // monthly-Snapshot → NICHT auf Saison-Rechnung
const PREV_SEASON_CHARGE = "ch_se_prev"; // Vorsaison → NICHT auf diese Rechnung
const SWITCHED_CHARGE = "ch_sw_back"; // Sponsor 2 (zurück auf monthly) → NICHT hier

async function seed(opts: { clubVerified?: boolean } = {}) {
  const tdb = await getTestDb();

  await tdb.insert(clubs).values({
    id: "club_se",
    slug: "se-fc",
    name: "Saisonende FC",
    isSmallBusiness: true,
    verifiedAt: opts.clubVerified === false ? null : new Date(Date.UTC(2025, 6, 1))
  });
  await tdb.insert(teams).values({
    id: "team_se",
    clubId: "club_se",
    name: "1. Herren",
    saison: "2526"
  });
  await tdb.insert(users).values([
    { id: "u_se_sp", name: "Saison-Sponsor", email: "se-sponsor@example.com" },
    { id: "u_se_admin", name: "Vorstand", email: "se-admin@example.com" },
    { id: "u_se_sp2", name: "Wechsler", email: "se-switcher@example.com" }
  ]);
  await tdb.insert(clubMemberships).values({
    userId: "u_se_admin",
    clubId: "club_se",
    role: "admin"
  });
  await tdb.insert(sponsors).values([
    {
      id: "sp_se",
      userId: "u_se_sp",
      displayName: "Saison-Sponsor",
      type: "familie",
      billingCycle: "season_end"
    },
    {
      // Sponsor 2: hat season_end-Snapshots, ist aber AKTUELL monthly —
      // dessen Charges holt die ERSTE Monatsrechnung ab, nicht der Saison-Lauf.
      id: "sp_sw",
      userId: "u_se_sp2",
      displayName: "Zurück-Wechsler",
      type: "familie",
      billingCycle: "monthly"
    }
  ]);
  await tdb.insert(pledges).values([
    {
      id: "pl_se",
      sponsorId: "sp_se",
      teamId: "team_se",
      status: "active",
      startsAt: new Date(Date.UTC(2025, 6, 1)),
      endsAt: new Date(Date.UTC(2026, 5, 30))
    },
    {
      id: "pl_sw",
      sponsorId: "sp_sw",
      teamId: "team_se",
      status: "active",
      startsAt: new Date(Date.UTC(2025, 6, 1)),
      endsAt: new Date(Date.UTC(2026, 5, 30))
    }
  ]);
  await tdb.insert(pledgeRules).values([
    {
      id: "pr_se_goal",
      pledgeId: "pl_se",
      triggerType: "goal_total",
      amountCents: 500,
      requiresApproval: false
    },
    {
      id: "pr_se_season",
      pledgeId: "pl_se",
      triggerType: "season_promotion",
      amountCents: 5000,
      requiresApproval: false
    },
    {
      id: "pr_se_win",
      pledgeId: "pl_se",
      triggerType: "win",
      amountCents: 300,
      requiresApproval: false
    },
    {
      id: "pr_sw_goal",
      pledgeId: "pl_sw",
      triggerType: "goal_total",
      amountCents: 700,
      requiresApproval: false
    }
  ]);
  await tdb.insert(matches).values({
    id: "m_se",
    teamId: "team_se",
    fussballdeSpielId: "fs_se_1",
    datum: new Date(Date.UTC(2025, 8, 14, 13, 0)),
    heimName: "Saisonende FC",
    gastName: "SV Gegner",
    ergebnisHeim: 1,
    ergebnisGast: 0,
    status: "finished"
  });

  await tdb.insert(charges).values([
    {
      id: SE_MATCH_CHARGE,
      pledgeId: "pl_se",
      pledgeRuleId: "pr_se_goal",
      matchId: "m_se",
      triggerType: "goal_total",
      amountCents: 500,
      billingCycleSnapshot: "season_end",
      status: "confirmed",
      confirmedAt: new Date(Date.UTC(2025, 8, 15, 12, 0))
    },
    {
      id: SE_SEASON_CHARGE,
      pledgeId: "pl_se",
      pledgeRuleId: "pr_se_season",
      matchId: null,
      saison: "2526",
      triggerType: "season_promotion",
      amountCents: 5000,
      billingCycleSnapshot: "season_end",
      status: "confirmed",
      confirmedAt: new Date(Date.UTC(2026, 5, 20, 12, 0))
    },
    {
      id: MONTHLY_CHARGE,
      pledgeId: "pl_se",
      pledgeRuleId: "pr_se_goal",
      matchId: "m_se",
      matchEventId: null,
      goalIndex: 2,
      triggerType: "goal_total",
      amountCents: 500,
      billingCycleSnapshot: "monthly",
      status: "confirmed",
      confirmedAt: new Date(Date.UTC(2026, 4, 10, 12, 0))
    },
    {
      id: PREV_SEASON_CHARGE,
      pledgeId: "pl_se",
      pledgeRuleId: "pr_se_win",
      matchId: "m_se",
      triggerType: "win",
      amountCents: 300,
      billingCycleSnapshot: "season_end",
      status: "confirmed",
      // Vorsaison: 15.6.2025 < 1.7.2025
      confirmedAt: new Date(Date.UTC(2025, 5, 15, 12, 0))
    },
    {
      id: SWITCHED_CHARGE,
      pledgeId: "pl_sw",
      pledgeRuleId: "pr_sw_goal",
      matchId: "m_se",
      triggerType: "goal_total",
      amountCents: 700,
      billingCycleSnapshot: "season_end",
      status: "confirmed",
      confirmedAt: new Date(Date.UTC(2026, 2, 10, 12, 0))
    }
  ]);
}

const RUN_AT = "2026-07-01T05:00:00.000Z";

describe.skipIf(isIntegrationDbDisabled)(
  "listSeasonEndChargesForWindow (integration)",
  () => {
    beforeEach(async () => {
      resendSendMock.mockClear();
      await resetTestDb();
      await seed();
    });
    afterAll(async () => {
      await closeTestDb();
    });

    it("liefert nur season_end-Snapshots aktueller season_end-Sponsoren im Fenster", async () => {
      const rows = await listSeasonEndChargesForWindow({
        windowStart: new Date(Date.UTC(2025, 6, 1)),
        windowEnd: new Date(Date.UTC(2026, 6, 1))
      });
      expect(rows.map((r) => r.chargeId).sort()).toEqual(
        [SE_MATCH_CHARGE, SE_SEASON_CHARGE].sort()
      );
    });

    // Wave 4: Saison-ZIEL-Charges (saison gesetzt, matchId null) entstehen oft
    // erst bei der Ergebnis-Eingabe NACH dem 1.7. (Relegation Ende Juni /
    // Anfang Juli). Sie dürfen NICHT an der oberen Fenstergrenze (< 1.7.)
    // rausfallen — sonst würden sie ~12 Monate zu spät oder nie fakturiert.
    it("nimmt eine erst NACH windowEnd bestätigte Saison-Charge trotzdem mit", async () => {
      const tdb = await getTestDb();
      // Saison-Charge: bestätigt 15.7.2026 → nach windowEnd 1.7.2026.
      await tdb
        .update(charges)
        .set({ confirmedAt: new Date(Date.UTC(2026, 6, 15, 12, 0)) })
        .where(eq(charges.id, SE_SEASON_CHARGE));
      // Match-Charge (saison null): ebenfalls nach windowEnd → muss RAUSfallen.
      await tdb
        .update(charges)
        .set({ confirmedAt: new Date(Date.UTC(2026, 6, 15, 12, 0)) })
        .where(eq(charges.id, SE_MATCH_CHARGE));

      const rows = await listSeasonEndChargesForWindow({
        windowStart: new Date(Date.UTC(2025, 6, 1)),
        windowEnd: new Date(Date.UTC(2026, 6, 1))
      });
      const ids = rows.map((r) => r.chargeId);
      expect(ids).toContain(SE_SEASON_CHARGE);
      expect(ids).not.toContain(SE_MATCH_CHARGE);
    });
  }
);

describe.skipIf(isIntegrationDbDisabled)("generate-season-end-invoices (integration)", () => {
  beforeEach(async () => {
    resendSendMock.mockClear();
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("EINE Rechnung pro (Sponsor, Club) mit Saison-Periode, Charges → invoiced, Mail an Sponsor + Verein", async () => {
    await seed();
    const tdb = await getTestDb();

    const res = await runSeasonEndJob(RUN_AT);
    expect(res.invoicesCreated).toBe(1);

    const invoiceRows = await tdb.select().from(invoices);
    expect(invoiceRows).toHaveLength(1);
    const inv = invoiceRows[0];
    expect(inv.sponsorId).toBe("sp_se");
    expect(inv.clubId).toBe("club_se");
    expect(inv.period).toBe("2025/26");
    // Kleinunternehmer: keine USt → 500 + 5000
    expect(inv.totalCents).toBe(5500);
    expect(inv.status).toBe("sent");

    const items = await tdb
      .select()
      .from(invoiceItems)
      .where(eq(invoiceItems.invoiceId, inv.id));
    expect(items).toHaveLength(2);

    const [seMatch] = await tdb
      .select()
      .from(charges)
      .where(eq(charges.id, SE_MATCH_CHARGE));
    expect(seMatch.status).toBe("invoiced");
    expect(seMatch.invoiceId).toBe(inv.id);

    // monthly-Snapshot + Vorsaison + Wechsler bleiben unangetastet
    for (const id of [MONTHLY_CHARGE, PREV_SEASON_CHARGE, SWITCHED_CHARGE]) {
      const [c] = await tdb.select().from(charges).where(eq(charges.id, id));
      expect(c.status).toBe("confirmed");
    }

    // Mails: 1× Sponsor, 1× Vereins-Admins
    expect(resendSendMock).toHaveBeenCalledTimes(2);
    const sponsorCall = resendSendMock.mock.calls.find(
      (c) => c[0].to === "se-sponsor@example.com"
    );
    expect(sponsorCall).toBeDefined();
    expect(sponsorCall![0].subject).toContain("Saison 2025/26");
    const adminCall = resendSendMock.mock.calls.find((c) =>
      Array.isArray(c[0].to)
        ? c[0].to.includes("se-admin@example.com")
        : c[0].to === "se-admin@example.com"
    );
    expect(adminCall).toBeDefined();
  });

  it("Idempotenz: zweiter Lauf erzeugt keine zweite Rechnung", async () => {
    await seed();
    const tdb = await getTestDb();

    await runSeasonEndJob(RUN_AT);
    resendSendMock.mockClear();
    const res2 = await runSeasonEndJob(RUN_AT);

    expect(res2.invoicesCreated).toBe(0);
    const invoiceRows = await tdb.select().from(invoices);
    expect(invoiceRows).toHaveLength(1);
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("Withhold-Gate: unverifizierter Verein → Rechnung withheld, keine Mail", async () => {
    await seed({ clubVerified: false });
    const tdb = await getTestDb();

    await runSeasonEndJob(RUN_AT);

    const invoiceRows = await tdb.select().from(invoices);
    expect(invoiceRows).toHaveLength(1);
    expect(invoiceRows[0].status).toBe("withheld");
    expect(resendSendMock).not.toHaveBeenCalled();
  });

  it("keine passenden Charges → kein Lauf-Effekt", async () => {
    const res = await runSeasonEndJob(RUN_AT);
    expect(res.invoicesCreated).toBe(0);
    expect(res.groups).toBe(0);
  });
});
