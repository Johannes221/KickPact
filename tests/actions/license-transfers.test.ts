/**
 * Paket B (Phase 5) — Lizenz-Transfer Server-Actions (Spec §1.5).
 *
 * Hybrid: echte Test-DB (DATABASE_URL_TEST), gemockt sind Auth
 * (assertClubWriteAccess/requireUser), Stripe-Client, Resend und Inngest.
 *
 * Abgedeckt:
 *   - requestLicenseTransfer-Guards (keine Vereinslizenz, kein Kandidat,
 *     Doppel-pending → {ok:false})
 *   - accept_license-Effekte: licensedUnderClubId sofort, Stripe-Retrieve →
 *     effectiveAt = current_period_end, cancel_at_period_end-Update,
 *     status='accepted'; ohne Stripe-Sub → effectiveAt=now + Inngest-Kick
 *   - accept_co_owned → Mitverwalter-Membership, kein licensedUnder
 *   - reject → status='rejected' + Mail an Vorstand
 *   - fremder User darf nicht entscheiden
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  resendSendMock,
  stripeRetrieveMock,
  stripeUpdateMock,
  inngestSendMock,
  requireUserMock,
  assertClubWriteAccessMock
} = vi.hoisted(() => ({
  resendSendMock: vi.fn().mockResolvedValue({ id: "stub", error: null }),
  stripeRetrieveMock: vi.fn(),
  stripeUpdateMock: vi.fn().mockResolvedValue({}),
  inngestSendMock: vi.fn().mockResolvedValue({ ids: [] }),
  requireUserMock: vi.fn(),
  assertClubWriteAccessMock: vi.fn()
}));

vi.mock("@/lib/auth/scope", () => ({
  assertClubWriteAccess: assertClubWriteAccessMock
}));
vi.mock("@/lib/auth/session", () => ({
  requireUser: requireUserMock
}));
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({
    subscriptions: { retrieve: stripeRetrieveMock, update: stripeUpdateMock }
  }),
  isStripeConfigured: () => true
}));
vi.mock("@/lib/mail/client", () => ({
  resend: { emails: { send: resendSendMock } },
  MAIL_FROM: "KickPact <stub@test.local>"
}));
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: inngestSendMock }
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

import { eq } from "drizzle-orm";
import {
  clubs,
  teams,
  users,
  clubMemberships,
  teamMemberships,
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
import {
  requestLicenseTransfer,
  respondLicenseTransfer
} from "@/lib/actions/license-transfers";
import { createLicenseTransferRequest } from "@/lib/db/queries/license-transfers";

const FV_ID = "fv-777";
const PERIOD_END_UNIX = Math.floor(Date.UTC(2026, 6, 31, 12, 0) / 1000);

async function seed() {
  const tdb = await getTestDb();

  await tdb.insert(users).values([
    { id: "u_trainer", email: "trainer@x.de", name: "Toni Trainer" },
    { id: "u_vorstand", email: "vorstand@y.de", name: "Vera Vorstand" },
    { id: "u_fremd", email: "fremd@z.de", name: "Fred Fremd" }
  ]);

  await tdb.insert(clubs).values([
    { id: "club_y", slug: "verein-y", name: "SV Y", fussballdeVereinId: FV_ID },
    { id: "club_x", slug: "container-x", name: "SV Y — Erste", fussballdeVereinId: FV_ID }
  ]);

  await tdb.insert(clubMemberships).values([
    { userId: "u_vorstand", clubId: "club_y", role: "admin" },
    { userId: "u_trainer", clubId: "club_x", role: "admin" }
  ]);

  await tdb.insert(teams).values([
    { id: "team_y1", clubId: "club_y", name: "Erste (Verein)", saison: "2526" },
    { id: "team_t1", clubId: "club_x", name: "Erste", saison: "2526" }
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

function authAsVorstand() {
  assertClubWriteAccessMock.mockResolvedValue({
    user: { id: "u_vorstand", email: "vorstand@y.de", name: "Vera Vorstand" },
    club: { id: "club_y", slug: "verein-y", name: "SV Y" },
    role: "admin",
    gate: { isReadOnly: false }
  });
}

function loginAs(id: string, email: string) {
  requireUserMock.mockResolvedValue({ id, email });
}

describe.skipIf(isIntegrationDbDisabled)("license-transfer actions", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seed();
    resendSendMock.mockClear();
    stripeRetrieveMock.mockReset();
    stripeUpdateMock.mockClear();
    inngestSendMock.mockClear();
    authAsVorstand();
    stripeRetrieveMock.mockResolvedValue({
      id: "sub_t1",
      items: { data: [{ id: "si_1", current_period_end: PERIOD_END_UNIX }] }
    });
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe("requestLicenseTransfer", () => {
    it("legt pending-Request an und mailt den Inhaber", async () => {
      const res = await requestLicenseTransfer({ clubSlug: "verein-y", teamId: "team_t1" });
      expect(res.ok).toBe(true);

      const tdb = await getTestDb();
      const [req] = await tdb.select().from(teamLicenseTransferRequests);
      expect(req).toMatchObject({
        teamId: "team_t1",
        toClubId: "club_y",
        fromUserId: "u_trainer",
        requestedByUserId: "u_vorstand",
        status: "pending"
      });

      expect(resendSendMock).toHaveBeenCalledOnce();
      const mailArgs = resendSendMock.mock.calls[0][0] as { to: string; subject: string };
      expect(mailArgs.to).toBe("trainer@x.de");
      expect(mailArgs.subject).toContain("Vereinslizenz");
    });

    it("blockt ohne aktive Vereinslizenz", async () => {
      const tdb = await getTestDb();
      await tdb
        .update(subscriptions)
        .set({ status: "cancelled" })
        .where(eq(subscriptions.clubId, "club_y"));

      const res = await requestLicenseTransfer({ clubSlug: "verein-y", teamId: "team_t1" });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.message).toContain("Vereinslizenz");
    });

    it("blockt Nicht-Kandidaten (Team bereits unter Vereinslizenz)", async () => {
      const tdb = await getTestDb();
      await tdb
        .update(teams)
        .set({ licensedUnderClubId: "club_y" })
        .where(eq(teams.id, "team_t1"));

      const res = await requestLicenseTransfer({ clubSlug: "verein-y", teamId: "team_t1" });
      expect(res.ok).toBe(false);
    });

    it("Doppel-pending → {ok:false} statt Throw", async () => {
      expect((await requestLicenseTransfer({ clubSlug: "verein-y", teamId: "team_t1" })).ok).toBe(true);
      const second = await requestLicenseTransfer({ clubSlug: "verein-y", teamId: "team_t1" });
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.message).toContain("bereits");
    });
  });

  describe("respondLicenseTransfer", () => {
    async function seedRequest() {
      return createLicenseTransferRequest({
        teamId: "team_t1",
        toClubId: "club_y",
        fromUserId: "u_trainer",
        requestedByUserId: "u_vorstand"
      });
    }

    it("nur fromUserId darf entscheiden", async () => {
      const req = await seedRequest();
      loginAs("u_fremd", "fremd@z.de");
      const res = await respondLicenseTransfer({ requestId: req.id, decision: "reject" });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.message).toContain("Lizenz-Inhaber");
    });

    it("accept_license: Branding sofort, effectiveAt=Periodenende, cancel_at_period_end, accepted", async () => {
      const req = await seedRequest();
      loginAs("u_trainer", "trainer@x.de");

      const res = await respondLicenseTransfer({
        requestId: req.id,
        decision: "accept_license"
      });
      expect(res.ok).toBe(true);

      const tdb = await getTestDb();
      const [team] = await tdb.select().from(teams).where(eq(teams.id, "team_t1"));
      expect(team.licensedUnderClubId).toBe("club_y");

      expect(stripeRetrieveMock).toHaveBeenCalledWith("sub_t1");
      expect(stripeUpdateMock).toHaveBeenCalledWith(
        "sub_t1",
        { cancel_at_period_end: true },
        { idempotencyKey: `license-transfer-cancel-${req.id}` }
      );

      const [updated] = await tdb
        .select()
        .from(teamLicenseTransferRequests)
        .where(eq(teamLicenseTransferRequests.id, req.id));
      expect(updated.status).toBe("accepted");
      expect(updated.decision).toBe("accept_license");
      expect(updated.effectiveAt?.getTime()).toBe(PERIOD_END_UNIX * 1000);
      // effectiveAt liegt in der Zukunft → kein sofortiger Cron-Kick
      expect(inngestSendMock).not.toHaveBeenCalled();

      // Lizenz selbst ist NOCH NICHT umgehängt (Flip macht der Cron)
      const [lic] = await tdb
        .select()
        .from(teamLicenses)
        .where(eq(teamLicenses.teamId, "team_t1"));
      expect(lic.subscriptionClubId).toBe("club_x");

      // Mail an Vorstand
      const mailArgs = resendSendMock.mock.calls[0][0] as { to: string; subject: string };
      expect(mailArgs.to).toBe("vorstand@y.de");
      expect(mailArgs.subject).toContain("angenommen");
    });

    it("accept_license ohne Stripe-Sub (Trial): effectiveAt=now + Inngest-Kick", async () => {
      const tdb = await getTestDb();
      await tdb
        .update(subscriptions)
        .set({ stripeSubscriptionId: null })
        .where(eq(subscriptions.clubId, "club_x"));

      const req = await seedRequest();
      loginAs("u_trainer", "trainer@x.de");
      const before = Date.now();
      const res = await respondLicenseTransfer({ requestId: req.id, decision: "accept_license" });
      expect(res.ok).toBe(true);

      expect(stripeRetrieveMock).not.toHaveBeenCalled();
      const [updated] = await tdb
        .select()
        .from(teamLicenseTransferRequests)
        .where(eq(teamLicenseTransferRequests.id, req.id));
      expect(updated.effectiveAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
      expect(updated.effectiveAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
      expect(inngestSendMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: "license-transfers/apply" })
      );
    });

    it("accept_license blockt, wenn die Vereinslizenz des Ziel-Vereins zwischenzeitlich ausgelaufen ist", async () => {
      // Zwischen Anfrage und Annahme (bis Perioden-Ende von T's Abo) kann die
      // Vereinslizenz des anfragenden Vereins auslaufen. Dann darf das Team NICHT
      // unter einen Verein ohne zahlende Lizenz gebrandet werden (sonst chargt
      // das Team-Gate still auf einen Verein, der nicht zahlt).
      const req = await seedRequest();
      const tdb = await getTestDb();
      await tdb
        .update(subscriptions)
        .set({ status: "cancelled" })
        .where(eq(subscriptions.clubId, "club_y"));
      loginAs("u_trainer", "trainer@x.de");

      const res = await respondLicenseTransfer({
        requestId: req.id,
        decision: "accept_license"
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.message).toContain("Vereinslizenz");

      // Team NICHT umgebrandet, Request bleibt pending, kein Stripe-Effekt.
      const [team] = await tdb.select().from(teams).where(eq(teams.id, "team_t1"));
      expect(team.licensedUnderClubId).toBeNull();
      const [request] = await tdb
        .select()
        .from(teamLicenseTransferRequests)
        .where(eq(teamLicenseTransferRequests.id, req.id));
      expect(request.status).toBe("pending");
      expect(stripeUpdateMock).not.toHaveBeenCalled();
    });

    it("accept_co_owned: Mitverwalter-Membership, kein licensedUnder, status co_owned", async () => {
      const req = await seedRequest();
      loginAs("u_trainer", "trainer@x.de");
      const res = await respondLicenseTransfer({ requestId: req.id, decision: "accept_co_owned" });
      expect(res.ok).toBe(true);

      const tdb = await getTestDb();
      const memberships = await tdb
        .select()
        .from(teamMemberships)
        .where(eq(teamMemberships.teamId, "team_t1"));
      expect(memberships).toEqual([
        expect.objectContaining({ userId: "u_vorstand", role: "admin" })
      ]);

      const [team] = await tdb.select().from(teams).where(eq(teams.id, "team_t1"));
      expect(team.licensedUnderClubId).toBeNull();
      expect(stripeUpdateMock).not.toHaveBeenCalled();

      const [updated] = await tdb
        .select()
        .from(teamLicenseTransferRequests)
        .where(eq(teamLicenseTransferRequests.id, req.id));
      expect(updated.status).toBe("co_owned");
    });

    it("reject: status rejected + Mail an Vorstand, keine Effekte", async () => {
      const req = await seedRequest();
      loginAs("u_trainer", "trainer@x.de");
      const res = await respondLicenseTransfer({
        requestId: req.id,
        decision: "reject",
        note: "Wir bleiben lieber eigenständig."
      });
      expect(res.ok).toBe(true);

      const tdb = await getTestDb();
      const [updated] = await tdb
        .select()
        .from(teamLicenseTransferRequests)
        .where(eq(teamLicenseTransferRequests.id, req.id));
      expect(updated.status).toBe("rejected");
      expect(updated.decisionNote).toContain("eigenständig");

      const [team] = await tdb.select().from(teams).where(eq(teams.id, "team_t1"));
      expect(team.licensedUnderClubId).toBeNull();
      expect(stripeUpdateMock).not.toHaveBeenCalled();

      const mailArgs = resendSendMock.mock.calls[0][0] as { to: string; subject: string };
      expect(mailArgs.to).toBe("vorstand@y.de");
      expect(mailArgs.subject).toContain("abgelehnt");
    });

    it("bereits entschiedene Anfrage → {ok:false}", async () => {
      const req = await seedRequest();
      loginAs("u_trainer", "trainer@x.de");
      await respondLicenseTransfer({ requestId: req.id, decision: "reject" });
      const again = await respondLicenseTransfer({ requestId: req.id, decision: "accept_license" });
      expect(again.ok).toBe(false);
      if (!again.ok) expect(again.message).toContain("bereits entschieden");
    });
  });
});
