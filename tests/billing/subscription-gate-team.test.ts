/**
 * Transfer-Übergangsfenster (Tier-1 Umsatzverlust): ein per Lizenz-Transfer an
 * einen Verein angehängtes Team (teams.licensedUnderClubId gesetzt) darf NICHT
 * dunkel gehen, wenn sein alter Container-Club per
 * `customer.subscription.deleted` auf `cancelled` läuft. Crawl-Gate und Geld-
 * Gate müssen — wie der Rechnungs-Layer — die Subscription des EFFEKTIVEN
 * Lizenz-Vereins (billingClubForTeam) lesen, nicht die von teams.clubId.
 *
 * getSubscriptionGateForTeam ist der Seam, den beide Gates (crawl-matches,
 * evaluate-match) sowie die Sponsor-Read-Only-Gates teilen.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { clubs, teams, subscriptions } from "@/lib/db/schema";
import {
  getSubscriptionGateForTeam,
  isCrawlBlockedByGate,
  isChargeBlockedByGate
} from "@/lib/db/queries/subscription-status";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";

/**
 * Repro-Aufstellung: Team T4 war autark im Container C_t (eigenes, jetzt
 * gekündigtes Stripe-Abo). Transfer an Verein V angenommen →
 * licensedUnderClubId=V. V zahlt die Vereinslizenz (active).
 */
async function seed() {
  const tdb = await getTestDb();

  await tdb.insert(clubs).values([
    { id: "club_ct", slug: "container-t", name: "Container C_t" },
    { id: "club_v", slug: "verein-v", name: "SV V e.V." }
  ]);

  await tdb.insert(subscriptions).values([
    // Container: echt gekündigt (Stripe-Sub existierte) → cancelled OHNE
    // trial_expired → blockt Crawl UND Charge.
    {
      clubId: "club_ct",
      status: "cancelled",
      stripeSubscriptionId: "sub_ct_cancelled"
    },
    // Lizenz-Verein: zahlendes, aktives Abo.
    {
      clubId: "club_v",
      status: "active",
      stripeSubscriptionId: "sub_v_active"
    }
  ]);

  await tdb.insert(teams).values({
    id: "team_t4",
    clubId: "club_ct",
    name: "T4",
    saison: "2526",
    licensedUnderClubId: "club_v"
  });
}

describe.skipIf(isIntegrationDbDisabled)("getSubscriptionGateForTeam", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seed();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("liest die Subscription des Lizenz-Vereins, nicht die des gekündigten Containers", async () => {
    const gate = await getSubscriptionGateForTeam("team_t4");
    expect(gate.status).toBe("active");
    expect(gate.isReadOnly).toBe(false);
    // Kern des Bugs: unter Vereinslizenz darf weder Crawl noch Charge blocken.
    expect(isCrawlBlockedByGate(gate)).toBe(false);
    expect(isChargeBlockedByGate(gate)).toBe(false);
  });

  it("fällt auf den Container-Club zurück, wenn licensedUnderClubId NULL ist", async () => {
    const tdb = await getTestDb();
    await tdb
      .update(teams)
      .set({ licensedUnderClubId: null })
      .where(eq(teams.id, "team_t4"));

    const gate = await getSubscriptionGateForTeam("team_t4");
    expect(gate.status).toBe("cancelled");
    expect(isCrawlBlockedByGate(gate)).toBe(true);
    expect(isChargeBlockedByGate(gate)).toBe(true);
  });

  it("liefert ein 'missing'-Gate (nicht geblockt) für unbekannte Teams", async () => {
    const gate = await getSubscriptionGateForTeam("team_nope");
    expect(gate.status).toBe("missing");
    expect(isCrawlBlockedByGate(gate)).toBe(false);
    expect(isChargeBlockedByGate(gate)).toBe(false);
  });
});
