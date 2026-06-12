/**
 * Paket B (Phase 5) — Lizenz-Transfer Query-Layer (Spec 2026-05-26 §1.4/§1.5).
 *
 * Integration gegen die Docker-Test-DB (DATABASE_URL_TEST), gated wie
 * club-reporting.test.ts. Getestet wird:
 *   - clubHasActiveVereinLicense (plan='verein' + subscriptions active/trialing)
 *   - listLicenseTransferCandidatesForClub (gleiche fussballdeVereinId,
 *     eigener Container, eigene autarke Lizenz, ohne licensedUnder)
 *   - Doppel-pending → Unique-Violation (partieller Index)
 *   - markLicenseTransferDecision flippt nur pending (Race-Guard)
 *   - attachTeamLicenseToVereinLicense → getTeamLicensePlan löst 'verein' auf
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import {
  clubs,
  teams,
  users,
  clubMemberships,
  subscriptions,
  teamLicenses,
  teamLicenseTransferRequests
} from "@/lib/db/schema";
import {
  clubHasActiveVereinLicense,
  createLicenseTransferRequest,
  getFirstClubAdmin,
  getPendingTransferRequestForTeam,
  getTeamLicenseRow,
  getVereinMasterLicense,
  listDueAcceptedLicenseTransfers,
  listLicenseTransferCandidatesForClub,
  listPendingTransferRequestsForUser,
  markLicenseTransferDecision,
  attachTeamLicenseToVereinLicense
} from "@/lib/db/queries/license-transfers";
import { getTeamLicensePlan } from "@/lib/db/queries/pledges";
import { isUniqueViolation } from "@/lib/db/errors";

const FV_ID = "fv-12345";

/**
 * Seed-Topologie:
 *   - Verein Y ("verein") mit aktiver Vereinslizenz (Master-License auf TY).
 *   - Container X (gleiche fussballdeVereinId) mit autarkem Team T1 (pro).
 *   - Container Z (andere fussballdeVereinId) mit autarkem Team T2.
 *   - Container W (gleiche fussballdeVereinId) mit Team T3 OHNE eigene Lizenz.
 */
async function seed() {
  const tdb = await getTestDb();

  await tdb.insert(users).values([
    { id: "u_trainer", email: "trainer@x.de", name: "Toni Trainer" },
    { id: "u_vorstand", email: "vorstand@y.de", name: "Vera Vorstand" }
  ]);

  await tdb.insert(clubs).values([
    { id: "club_y", slug: "verein-y", name: "SV Y", fussballdeVereinId: FV_ID },
    { id: "club_x", slug: "container-x", name: "SV Y — Erste", fussballdeVereinId: FV_ID },
    { id: "club_z", slug: "container-z", name: "FC Z", fussballdeVereinId: "fv-other" },
    { id: "club_w", slug: "container-w", name: "SV Y — Dritte", fussballdeVereinId: FV_ID }
  ]);

  await tdb.insert(clubMemberships).values([
    { userId: "u_vorstand", clubId: "club_y", role: "admin" },
    { userId: "u_trainer", clubId: "club_x", role: "admin" }
  ]);

  await tdb.insert(teams).values([
    { id: "team_y1", clubId: "club_y", name: "Erste (Verein)", saison: "2526" },
    { id: "team_t1", clubId: "club_x", name: "Erste", saison: "2526" },
    { id: "team_t2", clubId: "club_z", name: "Zweite", saison: "2526" },
    { id: "team_t3", clubId: "club_w", name: "Dritte", saison: "2526" }
  ]);

  await tdb.insert(subscriptions).values([
    { clubId: "club_y", status: "active" },
    { clubId: "club_x", status: "active", stripeSubscriptionId: "sub_t1" },
    { clubId: "club_z", status: "active" }
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
    },
    {
      id: "lic_t2",
      subscriptionClubId: "club_z",
      teamId: "team_t2",
      plan: "basic",
      status: "active"
    }
  ]);
}

describe.skipIf(isIntegrationDbDisabled)("license-transfers query layer", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seed();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe("clubHasActiveVereinLicense", () => {
    it("true für Verein mit plan='verein' + active subscription", async () => {
      expect(await clubHasActiveVereinLicense("club_y")).toBe(true);
    });

    it("false für Container mit pro-Lizenz", async () => {
      expect(await clubHasActiveVereinLicense("club_x")).toBe(false);
    });

    it("false wenn die Vereins-Subscription cancelled ist", async () => {
      const tdb = await getTestDb();
      await tdb
        .update(subscriptions)
        .set({ status: "cancelled" })
        .where(eq(subscriptions.clubId, "club_y"));
      expect(await clubHasActiveVereinLicense("club_y")).toBe(false);
    });
  });

  describe("listLicenseTransferCandidatesForClub", () => {
    it("liefert autarke Teams desselben realen Vereins aus fremden Containern", async () => {
      const rows = await listLicenseTransferCandidatesForClub("club_y");
      expect(rows.map((r) => r.teamId)).toEqual(["team_t1"]);
      expect(rows[0]).toMatchObject({
        teamName: "Erste",
        containerClubName: "SV Y — Erste",
        requestStatus: null
      });
    });

    it("schließt Teams ohne eigene Lizenz aus (team_t3)", async () => {
      const rows = await listLicenseTransferCandidatesForClub("club_y");
      expect(rows.find((r) => r.teamId === "team_t3")).toBeUndefined();
    });

    it("schließt bereits unter Vereinslizenz stehende Teams aus", async () => {
      const tdb = await getTestDb();
      await tdb
        .update(teams)
        .set({ licensedUnderClubId: "club_y" })
        .where(eq(teams.id, "team_t1"));
      const rows = await listLicenseTransferCandidatesForClub("club_y");
      expect(rows).toHaveLength(0);
    });

    it("zeigt den Status der jüngsten Anfrage an", async () => {
      await createLicenseTransferRequest({
        teamId: "team_t1",
        toClubId: "club_y",
        fromUserId: "u_trainer",
        requestedByUserId: "u_vorstand"
      });
      const rows = await listLicenseTransferCandidatesForClub("club_y");
      expect(rows[0]?.requestStatus).toBe("pending");
    });
  });

  describe("createLicenseTransferRequest", () => {
    it("blockt eine zweite pending-Anfrage per Unique-Violation", async () => {
      await createLicenseTransferRequest({
        teamId: "team_t1",
        toClubId: "club_y",
        fromUserId: "u_trainer",
        requestedByUserId: "u_vorstand"
      });
      let err: unknown = null;
      try {
        await createLicenseTransferRequest({
          teamId: "team_t1",
          toClubId: "club_y",
          fromUserId: "u_trainer",
          requestedByUserId: "u_vorstand"
        });
      } catch (e) {
        err = e;
      }
      expect(err).not.toBeNull();
      expect(isUniqueViolation(err)).toBe(true);
    });

    it("erlaubt eine neue Anfrage nach Ablehnung", async () => {
      const first = await createLicenseTransferRequest({
        teamId: "team_t1",
        toClubId: "club_y",
        fromUserId: "u_trainer",
        requestedByUserId: "u_vorstand"
      });
      await markLicenseTransferDecision({
        requestId: first.id,
        status: "rejected",
        decision: "reject",
        decidedByUserId: "u_trainer"
      });
      const second = await createLicenseTransferRequest({
        teamId: "team_t1",
        toClubId: "club_y",
        fromUserId: "u_trainer",
        requestedByUserId: "u_vorstand"
      });
      expect(second.id).not.toBe(first.id);
    });
  });

  describe("markLicenseTransferDecision", () => {
    it("flippt nur pending-Requests (Race-Guard)", async () => {
      const req = await createLicenseTransferRequest({
        teamId: "team_t1",
        toClubId: "club_y",
        fromUserId: "u_trainer",
        requestedByUserId: "u_vorstand"
      });
      const updated = await markLicenseTransferDecision({
        requestId: req.id,
        status: "accepted",
        decision: "accept_license",
        decidedByUserId: "u_trainer",
        effectiveAt: new Date("2026-07-01T00:00:00Z")
      });
      expect(updated?.status).toBe("accepted");

      // Zweiter Decide auf bereits entschiedenem Request → undefined
      const again = await markLicenseTransferDecision({
        requestId: req.id,
        status: "rejected",
        decision: "reject",
        decidedByUserId: "u_trainer"
      });
      expect(again).toBeUndefined();
    });
  });

  describe("Inbox-/Banner-Lookups", () => {
    it("listPendingTransferRequestsForUser + getPendingTransferRequestForTeam", async () => {
      await createLicenseTransferRequest({
        teamId: "team_t1",
        toClubId: "club_y",
        fromUserId: "u_trainer",
        requestedByUserId: "u_vorstand"
      });
      const inbox = await listPendingTransferRequestsForUser("u_trainer");
      expect(inbox).toHaveLength(1);
      expect(inbox[0]).toMatchObject({
        teamName: "Erste",
        toClubName: "SV Y"
      });

      const banner = await getPendingTransferRequestForTeam("team_t1");
      expect(banner?.toClubName).toBe("SV Y");

      expect(await listPendingTransferRequestsForUser("u_vorstand")).toHaveLength(0);
      expect(await getPendingTransferRequestForTeam("team_t2")).toBeUndefined();
    });
  });

  describe("Cron-Flip-Bausteine", () => {
    it("listDueAcceptedLicenseTransfers liefert nur fällige accepted-Requests", async () => {
      const req = await createLicenseTransferRequest({
        teamId: "team_t1",
        toClubId: "club_y",
        fromUserId: "u_trainer",
        requestedByUserId: "u_vorstand"
      });
      await markLicenseTransferDecision({
        requestId: req.id,
        status: "accepted",
        decision: "accept_license",
        decidedByUserId: "u_trainer",
        effectiveAt: new Date(Date.now() - 1000)
      });

      const due = await listDueAcceptedLicenseTransfers(new Date());
      expect(due.map((d) => d.teamId)).toEqual(["team_t1"]);

      // Future effectiveAt → nicht fällig
      const tdb = await getTestDb();
      await tdb
        .update(teamLicenseTransferRequests)
        .set({ effectiveAt: new Date(Date.now() + 86_400_000) })
        .where(eq(teamLicenseTransferRequests.id, req.id));
      expect(await listDueAcceptedLicenseTransfers(new Date())).toHaveLength(0);
    });

    it("attachTeamLicenseToVereinLicense hängt die Lizenz um → getTeamLicensePlan = 'verein'", async () => {
      const master = await getVereinMasterLicense("club_y");
      expect(master?.id).toBe("lic_master_y");

      await attachTeamLicenseToVereinLicense({
        teamId: "team_t1",
        toClubId: "club_y",
        masterLicenseId: master!.id
      });

      const row = await getTeamLicenseRow("team_t1");
      expect(row?.subscriptionClubId).toBe("club_y");
      expect(row?.parentClubLicenseId).toBe("lic_master_y");
      expect(await getTeamLicensePlan("team_t1")).toBe("verein");
    });

    it("attachTeamLicenseToVereinLicense legt fehlende Row an (plan='verein', auflösbar)", async () => {
      await attachTeamLicenseToVereinLicense({
        teamId: "team_t3",
        toClubId: "club_y",
        masterLicenseId: null
      });
      const row = await getTeamLicenseRow("team_t3");
      expect(row?.plan).toBe("verein");
      expect(await getTeamLicensePlan("team_t3")).toBe("verein");
    });
  });

  describe("getFirstClubAdmin", () => {
    it("liefert den ersten Admin des Container-Clubs", async () => {
      const admin = await getFirstClubAdmin("club_x");
      expect(admin).toMatchObject({ userId: "u_trainer", email: "trainer@x.de" });
      expect(await getFirstClubAdmin("club_w")).toBeUndefined();
    });
  });
});
