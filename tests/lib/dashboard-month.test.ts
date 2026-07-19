import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { users, clubs, teams, sponsors, pledges, pledgeRules, charges } from "@/lib/db/schema";
import { getTopClubsForMonth } from "@/lib/db/queries/platform-stats";
import { resetTestDb } from "../setup/db";
import { isIntegrationDbDisabled } from "../setup/integration-db";

async function seedChargeAt(
  createdAt: Date,
  clubName: string,
  opts: { status?: "confirmed" | "pending_approval" | "invoiced" | "cancelled"; confirmedAt?: Date } = {}
) {
  const userId = createId();
  await db.insert(users).values({ id: userId, email: `s-${userId}@k.local`, emailVerified: true, name: "S" });
  const sponsorId = createId();
  await db.insert(sponsors).values({ id: sponsorId, userId, displayName: "Sp", type: "familie" });
  const clubId = createId();
  await db.insert(clubs).values({ id: clubId, slug: `c-${clubId.slice(0, 6)}`, name: clubName, logoUrl: null });
  const teamId = createId();
  await db.insert(teams).values({ id: teamId, clubId, name: "T", saison: "2526" });
  const pledgeId = createId();
  await db.insert(pledges).values({ id: pledgeId, sponsorId, teamId, endsAt: new Date(Date.now() + 9e9) });
  const ruleId = createId();
  await db.insert(pledgeRules).values({ id: ruleId, pledgeId, triggerType: "goal_total", amountCents: 100 });
  await db.insert(charges).values({
    id: createId(),
    pledgeId,
    pledgeRuleId: ruleId,
    triggerType: "goal_total",
    amountCents: 100,
    status: opts.status ?? "confirmed",
    confirmedAt: opts.confirmedAt ?? null,
    createdAt
  });
}

describe.skipIf(isIntegrationDbDisabled)("getTopClubsForMonth", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("only counts charges within the requested month", async () => {
    // Januar 2026 und März 2026
    await seedChargeAt(new Date(2026, 0, 15, 12), "Januar-Club");
    await seedChargeAt(new Date(2026, 2, 10, 12), "Maerz-Club");

    const jan = await getTopClubsForMonth("2026-01", 5);
    expect(jan).toHaveLength(1);
    expect(jan[0].clubName).toBe("Januar-Club");

    const mar = await getTopClubsForMonth("2026-03", 5);
    expect(mar).toHaveLength(1);
    expect(mar[0].clubName).toBe("Maerz-Club");

    const feb = await getTopClubsForMonth("2026-02", 5);
    expect(feb).toHaveLength(0);
  });

  /**
   * Die Rangliste ist eine GELD-Kachel und muss dieselbe Menge zählen wie
   * Cap-Enforcement und Rechnung: CAP_COUNTED_STATUSES = confirmed + invoiced.
   * `pending_approval` ist von niemandem bestätigt — ein Verein durfte sich
   * sonst mit erfundenen Manual-Events an die Spitze der Top-Vereine melden.
   */
  it("zählt nur bestätigte Beiträge — pending_approval nicht", async () => {
    await seedChargeAt(new Date(Date.UTC(2026, 0, 15, 12)), "Bestaetigt-Club");
    await seedChargeAt(new Date(Date.UTC(2026, 0, 15, 12)), "Unbestaetigt-Club", {
      status: "pending_approval"
    });
    await seedChargeAt(new Date(Date.UTC(2026, 0, 15, 12)), "Storniert-Club", { status: "cancelled" });

    const jan = await getTopClubsForMonth("2026-01", 5);
    expect(jan.map((r) => r.clubName)).toEqual(["Bestaetigt-Club"]);
  });

  /** `invoiced` bleibt drin — sonst fällt der Vormonat nach Rechnungslauf aus der Liste. */
  it("zählt invoiced-Beiträge weiter mit", async () => {
    await seedChargeAt(new Date(Date.UTC(2026, 0, 15, 12)), "Fakturiert-Club", { status: "invoiced" });

    const jan = await getTopClubsForMonth("2026-01", 5);
    expect(jan.map((r) => r.clubName)).toEqual(["Fakturiert-Club"]);
  });

  /**
   * Anker ist COALESCE(confirmedAt, createdAt) wie überall sonst
   * (chargeCountsTowardCap, lib/invoicing/period.ts): ein Spät-Confirm gehört in
   * den Monat, in dem er bestätigt — und damit fakturiert — wurde.
   */
  it("fenstert über confirmedAt, nicht über createdAt", async () => {
    await seedChargeAt(new Date(Date.UTC(2026, 0, 20, 12)), "SpaetConfirm-Club", {
      confirmedAt: new Date(Date.UTC(2026, 1, 3, 12))
    });

    expect(await getTopClubsForMonth("2026-01", 5)).toHaveLength(0);
    expect((await getTopClubsForMonth("2026-02", 5)).map((r) => r.clubName)).toEqual([
      "SpaetConfirm-Club"
    ]);
  });

  /**
   * Monatsgrenze in UTC, identisch zur Rechnungsperiode. Mit lokalen
   * Date-Konstruktoren (Server-TZ ≠ UTC) rutschte der letzte Abend eines Monats
   * in den Folgemonat — Rangliste und Rechnung wiesen dieselbe Charge
   * unterschiedlichen Monaten zu.
   */
  it("schneidet den Monat in UTC, nicht in Server-Ortszeit", async () => {
    // 28.02.2026 23:30 UTC = 01.03. 00:30 in Europe/Berlin.
    await seedChargeAt(new Date("2026-02-28T23:30:00Z"), "Grenz-Club");

    expect((await getTopClubsForMonth("2026-02", 5)).map((r) => r.clubName)).toEqual(["Grenz-Club"]);
    expect(await getTopClubsForMonth("2026-03", 5)).toHaveLength(0);
  });
});
