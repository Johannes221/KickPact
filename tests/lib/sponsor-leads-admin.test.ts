import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@/lib/db/client";
import { clubs, teams, sponsorLeads } from "@/lib/db/schema";
import {
  listSponsorLeadsForAdmin,
  countOpenSponsorLeads,
  setSponsorLeadHandled
} from "@/lib/db/queries/sponsor-leads-admin";
import { resetTestDb } from "../setup/db";
import { isIntegrationDbDisabled } from "../setup/integration-db";

async function seedTeam(clubName = "FC Test", teamName = "1. Herren") {
  const clubId = createId();
  await db.insert(clubs).values({
    id: clubId,
    slug: `c-${clubId.slice(0, 6)}`,
    name: clubName,
    logoUrl: null
  });
  const teamId = createId();
  await db.insert(teams).values({ id: teamId, clubId, name: teamName, saison: "2526" });
  return { clubId, teamId };
}

async function seedLead(
  teamId: string,
  overrides: Partial<{ name: string; email: string; message: string | null; createdAt: Date; handledAt: Date | null }> = {}
) {
  const id = createId();
  await db.insert(sponsorLeads).values({
    id,
    teamId,
    name: overrides.name ?? "Max Mustermann",
    email: overrides.email ?? "max@example.com",
    message: overrides.message ?? "Ich würde gern sponsern",
    ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
    handledAt: overrides.handledAt ?? null
  });
  return id;
}

describe.skipIf(isIntegrationDbDisabled)("sponsor-leads-admin queries", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("lists leads with team/club context", async () => {
    const { teamId } = await seedTeam("SV Musterstadt", "2. Herren");
    const leadId = await seedLead(teamId, { name: "Erika", email: "erika@example.com" });

    const { leads, total } = await listSponsorLeadsForAdmin();

    expect(total).toBe(1);
    expect(leads[0].id).toBe(leadId);
    expect(leads[0].name).toBe("Erika");
    expect(leads[0].email).toBe("erika@example.com");
    expect(leads[0].clubName).toBe("SV Musterstadt");
    expect(leads[0].teamName).toBe("2. Herren");
    expect(leads[0].handledAt).toBeNull();
  });

  it("sorts newest first", async () => {
    const { teamId } = await seedTeam();
    const older = await seedLead(teamId, {
      email: "old@example.com",
      createdAt: new Date(Date.now() - 3 * 86400_000)
    });
    const newer = await seedLead(teamId, {
      email: "new@example.com",
      createdAt: new Date(Date.now() - 1 * 86400_000)
    });

    const { leads } = await listSponsorLeadsForAdmin();

    expect(leads.map((l) => l.id)).toEqual([newer, older]);
  });

  it("filters to open leads only", async () => {
    const { teamId } = await seedTeam();
    const open = await seedLead(teamId, { email: "open@example.com" });
    await seedLead(teamId, { email: "done@example.com", handledAt: new Date() });

    const { leads, total } = await listSponsorLeadsForAdmin({ status: "open" });

    expect(total).toBe(1);
    expect(leads[0].id).toBe(open);
  });

  it("filters to handled leads only", async () => {
    const { teamId } = await seedTeam();
    await seedLead(teamId, { email: "open@example.com" });
    const done = await seedLead(teamId, { email: "done@example.com", handledAt: new Date() });

    const { leads, total } = await listSponsorLeadsForAdmin({ status: "handled" });

    expect(total).toBe(1);
    expect(leads[0].id).toBe(done);
  });

  it("searches across name, email and club", async () => {
    const { teamId: t1 } = await seedTeam("FC Alpha");
    const { teamId: t2 } = await seedTeam("FC Beta");
    await seedLead(t1, { name: "Anna Schmidt", email: "anna@alpha.de" });
    await seedLead(t2, { name: "Bert Meier", email: "bert@beta.de" });

    expect((await listSponsorLeadsForAdmin({ search: "Anna" })).total).toBe(1);
    expect((await listSponsorLeadsForAdmin({ search: "beta.de" })).total).toBe(1);
    expect((await listSponsorLeadsForAdmin({ search: "FC Beta" })).total).toBe(1);
    expect((await listSponsorLeadsForAdmin({ search: "FC" })).total).toBe(2);
  });

  it("counts only open leads for the nav badge", async () => {
    const { teamId } = await seedTeam();
    await seedLead(teamId, { email: "a@example.com" });
    await seedLead(teamId, { email: "b@example.com" });
    await seedLead(teamId, { email: "c@example.com", handledAt: new Date() });

    expect(await countOpenSponsorLeads()).toBe(2);
  });

  it("marks a lead handled and back to open", async () => {
    const { teamId } = await seedTeam();
    const leadId = await seedLead(teamId);

    const handled = await setSponsorLeadHandled(leadId, true);
    expect(handled?.handledAt).toBeInstanceOf(Date);
    expect(await countOpenSponsorLeads()).toBe(0);

    const reopened = await setSponsorLeadHandled(leadId, false);
    expect(reopened?.handledAt).toBeNull();
    expect(await countOpenSponsorLeads()).toBe(1);
  });

  it("returns null when marking an unknown lead", async () => {
    expect(await setSponsorLeadHandled(createId(), true)).toBeNull();
  });

  it("paginates", async () => {
    const { teamId } = await seedTeam();
    for (let i = 0; i < 5; i++) {
      await seedLead(teamId, {
        email: `l${i}@example.com`,
        createdAt: new Date(Date.now() - i * 86400_000)
      });
    }

    const page = await listSponsorLeadsForAdmin({ limit: 2, offset: 2 });

    expect(page.total).toBe(5);
    expect(page.leads).toHaveLength(2);
    expect(page.leads[0].email).toBe("l2@example.com");
  });
});
