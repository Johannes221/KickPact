/**
 * Paket B (Phase 5) — Branding-Resolver `billingClubForTeam` + Wirkung im
 * Rechnungslauf (Spec §1.5: „Branding wechselt sofort beim Annahme-Tag").
 *
 * Teil 1: billingClubForTeam = licensedUnderClubId ?? clubId → Club-Row.
 * Teil 2 (Integration, Pattern generate-invoices-season.test.ts): Team im
 * Container X steht unter Vereinslizenz von Y → die Rechnung wird mit Ys
 * Absender erzeugt: Withhold-Gate prüft Y.verifiedAt (X ist unverifiziert!),
 * Admin-Mail geht an Ys Vorstand, Nummernkreis läuft auf Y.
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
  invoiceCounters,
  clubMemberships
} from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import { billingClubForTeam } from "@/lib/billing/billing-club";
import { generateInvoices } from "@/lib/inngest/functions/generate-invoices";

function createStepStub() {
  return {
    run: async <T>(_label: string, fn: () => Promise<T> | T): Promise<T> => fn()
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
    }) => Promise<{ invoicesCreated: number }>;
  }).fn;
  return fn({
    step: createStepStub(),
    logger: createLoggerStub(),
    event: { data: { period } }
  });
}

async function seed() {
  const tdb = await getTestDb();

  await tdb.insert(users).values([
    { id: "u_sponsor", email: "sponsor@test.de", name: "Sandra Sponsor" },
    { id: "u_trainer", email: "trainer@x.de", name: "Toni Trainer" },
    { id: "u_vorstand", email: "vorstand@y.de", name: "Vera Vorstand" }
  ]);

  // Container X: UNVERIFIZIERT, keine IBAN. Verein Y: verifiziert + IBAN.
  await tdb.insert(clubs).values([
    {
      id: "club_x",
      slug: "container-x",
      name: "SV Y — Erste (Container)",
      isSmallBusiness: true,
      verifiedAt: null
    },
    {
      id: "club_y",
      slug: "verein-y",
      name: "SV Y e.V.",
      isSmallBusiness: true,
      iban: "DE02120300000000202051",
      verifiedAt: new Date(Date.UTC(2026, 0, 1))
    }
  ]);

  await tdb.insert(clubMemberships).values([
    { userId: "u_trainer", clubId: "club_x", role: "admin" },
    { userId: "u_vorstand", clubId: "club_y", role: "admin" }
  ]);

  await tdb.insert(teams).values({
    id: "team_1",
    clubId: "club_x",
    name: "Erste",
    saison: "2526",
    // Branding-Flip ist passiert (accept_license): unter Ys Vereinslizenz
    licensedUnderClubId: "club_y"
  });

  await tdb.insert(sponsors).values({
    id: "sp_1",
    userId: "u_sponsor",
    displayName: "Sandra Sponsor",
    type: "familie"
  });

  await tdb.insert(pledges).values({
    id: "pl_1",
    sponsorId: "sp_1",
    teamId: "team_1",
    status: "active",
    startsAt: new Date(Date.UTC(2026, 3, 1)),
    endsAt: new Date(Date.UTC(2026, 5, 30))
  });
  await tdb.insert(pledgeRules).values({
    id: "pr_1",
    pledgeId: "pl_1",
    triggerType: "goal_total",
    amountCents: 500,
    requiresApproval: false
  });

  await tdb.insert(matches).values({
    id: "m_1",
    teamId: "team_1",
    fussballdeSpielId: "fs_bc_1",
    datum: new Date(Date.UTC(2026, 4, 10, 13, 0)),
    heimName: "Erste",
    gastName: "Gegner",
    ergebnisHeim: 2,
    ergebnisGast: 1,
    status: "finished"
  });

  await tdb.insert(charges).values({
    id: "ch_1",
    pledgeId: "pl_1",
    pledgeRuleId: "pr_1",
    matchId: "m_1",
    triggerType: "goal_total",
    amountCents: 1000,
    status: "confirmed",
    confirmedAt: new Date(Date.UTC(2026, 4, 11, 12, 0))
  });
}

describe.skipIf(isIntegrationDbDisabled)("billingClubForTeam", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seed();
    resendSendMock.mockClear();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("liefert den Lizenz-Verein, wenn licensedUnderClubId gesetzt ist", async () => {
    const club = await billingClubForTeam("team_1");
    expect(club?.id).toBe("club_y");
    expect(club?.iban).toBe("DE02120300000000202051");
  });

  it("fällt auf den Container-Club zurück, wenn licensedUnderClubId NULL ist", async () => {
    const tdb = await getTestDb();
    await tdb
      .update(teams)
      .set({ licensedUnderClubId: null })
      .where(eq(teams.id, "team_1"));
    const club = await billingClubForTeam("team_1");
    expect(club?.id).toBe("club_x");
  });

  it("undefined für unbekannte Teams", async () => {
    expect(await billingClubForTeam("team_nope")).toBeUndefined();
  });

  describe("generate-invoices Branding-Wirkung", () => {
    it("brandet die Rechnung über den Lizenz-Verein (Gate, Mail-Empfänger, Nummernkreis)", async () => {
      const result = await runInvoiceJob("2026-05");
      expect(result.invoicesCreated).toBe(1);

      const tdb = await getTestDb();
      const [inv] = await tdb.select().from(invoices);
      // Withhold-Gate folgt Y.verifiedAt (X ist NICHT verifiziert) → versendet.
      expect(inv.status).toBe("sent");
      // Review M1 (2026-06-12): Die Rechnung gehört dem BILLING-Club —
      // damit finden Verifizierungs-Release und die Abrechnungs-Seite des
      // Vereins die Rechnung (vorher: Gate auf Y, Release suchte unter X →
      // withheld für immer).
      expect(inv.clubId).toBe("club_y");

      // Nummernkreis läuft auf dem Lizenz-Verein Y.
      const counters = await tdb.select().from(invoiceCounters);
      expect(counters).toHaveLength(1);
      expect(counters[0].clubId).toBe("club_y");

      // Admin-Mail geht an Ys Vorstand (nicht an Xs Trainer); Sponsor-Mail
      // nennt den Vereins-Namen als Absender-Club.
      const recipients = resendSendMock.mock.calls.map(
        (c) => (c[0] as { to: string | string[] }).to
      );
      expect(recipients.flat()).toContain("vorstand@y.de");
      expect(recipients.flat()).not.toContain("trainer@x.de");
      const sponsorCall = resendSendMock.mock.calls
        .map((c) => c[0] as { to: string | string[]; text: string })
        .find((c) => [c.to].flat().includes("sponsor@test.de"));
      expect(sponsorCall?.text).toContain("SV Y e.V.");
    });

    it("ohne licensedUnder bleibt das Container-Gate wirksam (withheld)", async () => {
      const tdb = await getTestDb();
      await tdb
        .update(teams)
        .set({ licensedUnderClubId: null })
        .where(eq(teams.id, "team_1"));

      await runInvoiceJob("2026-05");
      const [inv] = await tdb.select().from(invoices);
      // Container X ist unverifiziert → Rechnung wird zurückgehalten.
      expect(inv.status).toBe("withheld");
    });
  });
});
