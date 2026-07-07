import { beforeEach, describe, expect, it } from "vitest";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  users,
  clubs,
  teams,
  clubMemberships,
  teamMemberships,
  subscriptions,
  teamLicenses
} from "@/lib/db/schema";
import { resolveTeamAccess, resolveTeamPageAccess } from "@/lib/auth/scope";
import { resetTestDb } from "../setup/db";

interface Fixture {
  userId: string;
  clubId: string;
  teamId: string;
  otherTeamId: string;
}

async function seed(): Promise<Fixture> {
  const userId = createId();
  const clubId = createId();
  const teamId = createId();
  const otherTeamId = createId();

  await db.insert(users).values({
    id: userId,
    email: `test-${userId}@kickpact.local`,
    emailVerified: true,
    name: "Test User",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  await db.insert(clubs).values({
    id: clubId,
    slug: `c-${clubId.slice(0, 8)}`,
    name: "Test Club"
  });
  await db.insert(teams).values([
    { id: teamId, clubId, name: "1. Herren", saison: "2526" },
    { id: otherTeamId, clubId, name: "2. Herren", saison: "2526" }
  ]);
  return { userId, clubId, teamId, otherTeamId };
}

/**
 * Macht ein Team „vereinsgeführt" (unter Vereinslizenz). Voraussetzung dafür,
 * dass der Club-Admin-/Trainer-Durchgriff in resolveTeamAccess greift.
 */
async function grantVereinsLizenz(clubId: string, teamId: string) {
  await db.insert(subscriptions).values({ clubId }).onConflictDoNothing();
  await db.insert(teamLicenses).values({
    subscriptionClubId: clubId,
    teamId,
    plan: "verein",
    status: "active"
  });
}

/**
 * Gibt dem Team eine EIGENE basic/pro-Einzellizenz ohne Vereinsbündelung →
 * autark. Voraussetzung dafür, dass der Club-Admin-Durchgriff BLOCKIERT wird.
 */
async function grantAutarkLizenz(
  clubId: string,
  teamId: string,
  plan: "basic" | "pro" = "pro"
) {
  await db.insert(subscriptions).values({ clubId }).onConflictDoNothing();
  await db.insert(teamLicenses).values({
    subscriptionClubId: clubId,
    teamId,
    plan,
    status: "active"
  });
}

/** Zweiter Verein (der übernehmende Lizenz-Verein B) inkl. Admin-User. */
async function seedLicensingClub(): Promise<{ clubB: string; adminB: string }> {
  const clubB = createId();
  const adminB = createId();
  await db.insert(clubs).values({
    id: clubB,
    slug: `b-${clubB.slice(0, 8)}`,
    name: "Verein B"
  });
  await db.insert(users).values({
    id: adminB,
    email: `b-${adminB}@kickpact.local`,
    emailVerified: true,
    name: "Vorstand B",
    createdAt: new Date(),
    updatedAt: new Date()
  });
  await db.insert(clubMemberships).values({ userId: adminB, clubId: clubB, role: "admin" });
  return { clubB, adminB };
}

async function setLicensedUnder(teamId: string, clubId: string | null) {
  await db.update(teams).set({ licensedUnderClubId: clubId }).where(eq(teams.id, teamId));
}

describe("resolveTeamAccess", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("denies when team does not exist", async () => {
    const userId = createId();
    await db.insert(users).values({
      id: userId,
      email: `t-${userId}@kickpact.local`,
      emailVerified: true,
      name: "X",
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const r = await resolveTeamAccess(userId, "nonexistent", "viewer");
    expect(r.granted).toBe(false);
  });

  it("denies when user has no membership at all", async () => {
    const { userId, teamId } = await seed();
    const r = await resolveTeamAccess(userId, teamId, "viewer");
    expect(r.granted).toBe(false);
  });

  it("grants club-admin access at scope=club (vereinsgeführt)", async () => {
    const { userId, clubId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId, clubId, role: "admin" });
    await grantVereinsLizenz(clubId, teamId);
    const r = await resolveTeamAccess(userId, teamId, "viewer");
    expect(r.granted).toBe(true);
    if (!r.granted) return;
    expect(r.scope).toBe("club");
    expect(r.role).toBe("admin");
  });

  it("grants club-trainer access when only viewer is required (vereinsgeführt)", async () => {
    const { userId, clubId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId, clubId, role: "trainer" });
    await grantVereinsLizenz(clubId, teamId);
    const r = await resolveTeamAccess(userId, teamId, "viewer");
    expect(r.granted).toBe(true);
    if (!r.granted) return;
    expect(r.scope).toBe("club");
    expect(r.role).toBe("trainer");
  });

  it("denies club-viewer when admin is required (vereinsgeführt)", async () => {
    const { userId, clubId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId, clubId, role: "viewer" });
    await grantVereinsLizenz(clubId, teamId);
    const r = await resolveTeamAccess(userId, teamId, "admin");
    expect(r.granted).toBe(false);
  });

  it("denies club-admin durchgriff on an AUTARK team (own pro license, no parent)", async () => {
    const { userId, clubId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId, clubId, role: "admin" });
    // Eigene pro-Einzellizenz ohne Parent → autark → kein Durchgriff.
    await grantAutarkLizenz(clubId, teamId, "pro");
    const r = await resolveTeamAccess(userId, teamId, "viewer");
    expect(r.granted).toBe(false);
  });

  it("grants club-admin durchgriff on a LICENSELESS container team (loop regression)", async () => {
    // Kern-Regression: ein lizenzloses Team im Vereins-Container ist NICHT
    // autark. Würde der Durchgriff hier verweigert, routet die Identity-Logik
    // den Club-Admin (primary_role = club-team-<teamId>) in genau dieses Team,
    // der Page-Guard wirft ihn auf /dashboard zurück → Endlos-Redirect.
    const { userId, clubId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId, clubId, role: "admin" });
    // KEINE Lizenz-Zeile für teamId (seed legt nur Teams an).
    const r = await resolveTeamAccess(userId, teamId, "viewer");
    expect(r.granted).toBe(true);
    if (!r.granted) return;
    expect(r.scope).toBe("club");
    expect(r.role).toBe("admin");
  });

  // A5 (Lizenz-Transfer, Access-Seite): nach accept_license bleibt teams.clubId
  // der ALT-Container, teams.licensedUnderClubId zeigt auf den zahlenden Verein.
  // Der Durchgriff MUSS dem effektiven Lizenz-Verein folgen (licensedUnderClubId
  // ?? clubId) — wie Gate/Billing —, sonst greift der Alt-Container durch (Leak)
  // und der zahlende Verein bekommt gar keinen Zugriff.
  it("grants the LICENSING club's admin durchgriff on a transferred team (flipped)", async () => {
    const { clubId: containerId, teamId } = await seed();
    const { clubB, adminB } = await seedLicensingClub();
    // Transfer angenommen + geflippt: Branding auf B, Lizenz plan=verein unter B.
    await setLicensedUnder(teamId, clubB);
    await grantVereinsLizenz(clubB, teamId);
    void containerId;
    const r = await resolveTeamAccess(adminB, teamId, "admin");
    expect(r.granted).toBe(true);
    if (!r.granted) return;
    expect(r.scope).toBe("club");
    expect(r.role).toBe("admin");
  });

  it("denies the OLD container admin durchgriff after a license transfer", async () => {
    const { userId: containerAdmin, clubId: containerId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId: containerAdmin, clubId: containerId, role: "admin" });
    const { clubB } = await seedLicensingClub();
    await setLicensedUnder(teamId, clubB);
    await grantVereinsLizenz(clubB, teamId);
    // Alt-Container-Admin ohne team_membership → nach dem Flip KEIN Durchgriff.
    const r = await resolveTeamAccess(containerAdmin, teamId, "viewer");
    expect(r.granted).toBe(false);
  });

  it("during the transfer window (branding set, license not yet flipped): B in, old container out", async () => {
    const { userId: containerAdmin, clubId: containerId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId: containerAdmin, clubId: containerId, role: "admin" });
    // Fenster: Team trägt noch die eigene pro-Lizenz (autark-Form), Branding
    // aber schon auf B. licensedUnderClubId hebt die Autark-Sperre für B auf.
    await grantAutarkLizenz(containerId, teamId, "pro");
    const { clubB, adminB } = await seedLicensingClub();
    await setLicensedUnder(teamId, clubB);
    const rB = await resolveTeamAccess(adminB, teamId, "viewer");
    expect(rB.granted).toBe(true);
    const rA = await resolveTeamAccess(containerAdmin, teamId, "viewer");
    expect(rA.granted).toBe(false);
  });

  it("grants autark-team access via direct team-membership despite gating", async () => {
    const { userId, clubId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId, clubId, role: "admin" });
    await db.insert(teamMemberships).values({ userId, teamId, role: "admin" });
    // Eigene pro-Einzellizenz → autark → Club-Durchgriff blockiert → der Zugriff
    // MUSS aus der direkten team_membership kommen (scope=team).
    await grantAutarkLizenz(clubId, teamId, "pro");
    const r = await resolveTeamAccess(userId, teamId, "admin");
    expect(r.granted).toBe(true);
    if (!r.granted) return;
    expect(r.scope).toBe("team");
    expect(r.role).toBe("admin");
  });

  it("grants team-admin access at scope=team", async () => {
    const { userId, teamId } = await seed();
    await db.insert(teamMemberships).values({ userId, teamId, role: "admin" });
    const r = await resolveTeamAccess(userId, teamId, "admin");
    expect(r.granted).toBe(true);
    if (!r.granted) return;
    expect(r.scope).toBe("team");
    expect(r.role).toBe("admin");
  });

  it("denies team-viewer when admin is required", async () => {
    const { userId, teamId } = await seed();
    await db.insert(teamMemberships).values({ userId, teamId, role: "viewer" });
    const r = await resolveTeamAccess(userId, teamId, "admin");
    expect(r.granted).toBe(false);
  });

  it("does not grant access to a different team within the same club via team-membership", async () => {
    const { userId, teamId, otherTeamId } = await seed();
    await db.insert(teamMemberships).values({ userId, teamId, role: "admin" });
    const r = await resolveTeamAccess(userId, otherTeamId, "viewer");
    expect(r.granted).toBe(false);
  });

  it("prefers club-scope over team-scope when both exist (vereinsgeführt)", async () => {
    const { userId, clubId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId, clubId, role: "admin" });
    await db.insert(teamMemberships).values({ userId, teamId, role: "viewer" });
    await grantVereinsLizenz(clubId, teamId);
    const r = await resolveTeamAccess(userId, teamId, "viewer");
    expect(r.granted).toBe(true);
    if (!r.granted) return;
    expect(r.scope).toBe("club");
    expect(r.role).toBe("admin");
  });

  it("falls back to team-admin when club-viewer does not satisfy minRole", async () => {
    const { userId, clubId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId, clubId, role: "viewer" });
    await db.insert(teamMemberships).values({ userId, teamId, role: "admin" });
    await grantVereinsLizenz(clubId, teamId);
    const r = await resolveTeamAccess(userId, teamId, "admin");
    expect(r.granted).toBe(true);
    if (!r.granted) return;
    expect(r.scope).toBe("team");
    expect(r.role).toBe("admin");
  });

  // ── clubMinRole: getrennter Club-Floor (Match-Event-Schreib-Actions) ──
  // Match-Events dürfen Club-TRAINER schreiben, in autarken Teams aber nur der
  // Mannschafts-ADMIN (Team-Memberships kennen kein „trainer"). Der 4. Parameter
  // entkoppelt den Club-Floor vom Team-Floor.

  it("grants club-trainer at scope=club when clubMinRole=trainer but teamMinRole=admin (vereinsgeführt)", async () => {
    const { userId, clubId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId, clubId, role: "trainer" });
    await grantVereinsLizenz(clubId, teamId);
    const r = await resolveTeamAccess(userId, teamId, "admin", "trainer");
    expect(r.granted).toBe(true);
    if (!r.granted) return;
    expect(r.scope).toBe("club");
    expect(r.role).toBe("trainer");
  });

  it("still blocks club-trainer durchgriff on an AUTARK team even with clubMinRole=trainer", async () => {
    const { userId, clubId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId, clubId, role: "trainer" });
    await grantAutarkLizenz(clubId, teamId, "pro");
    // Kein team_membership → autark blockt Club-Durchgriff → kein Zugriff.
    const r = await resolveTeamAccess(userId, teamId, "admin", "trainer");
    expect(r.granted).toBe(false);
  });

  it("grants autark team-admin via team-scope when clubMinRole=trainer (match-event floor)", async () => {
    const { userId, clubId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId, clubId, role: "trainer" });
    await db.insert(teamMemberships).values({ userId, teamId, role: "admin" });
    await grantAutarkLizenz(clubId, teamId, "pro");
    const r = await resolveTeamAccess(userId, teamId, "admin", "trainer");
    expect(r.granted).toBe(true);
    if (!r.granted) return;
    expect(r.scope).toBe("team");
    expect(r.role).toBe("admin");
  });

  it("defaults clubMinRole to minRole (unchanged behavior): club-trainer denied at minRole=admin", async () => {
    const { userId, clubId, teamId } = await seed();
    await db.insert(clubMemberships).values({ userId, clubId, role: "trainer" });
    await grantVereinsLizenz(clubId, teamId);
    // Ohne 4. Parameter bleibt der Club-Floor = admin → Trainer reicht nicht.
    const r = await resolveTeamAccess(userId, teamId, "admin");
    expect(r.granted).toBe(false);
  });
});

/**
 * resolveTeamPageAccess deckt die Page-Guard-Schicht ab: Berechtigung +
 * Slug-Cosmetic-Match. Diese Tests verhindern Regression der HIGH-Findings
 * aus dem Rollen-Audit (2026-05-26).
 */
describe("resolveTeamPageAccess", () => {
  async function seedWithSlug(): Promise<Fixture & { clubSlug: string }> {
    const fx = await seed();
    const [club] = await db
      .select({ slug: clubs.slug })
      .from(clubs)
      .where(eq(clubs.id, fx.clubId))
      .limit(1);
    return { ...fx, clubSlug: club!.slug };
  }

  beforeEach(async () => {
    await resetTestDb();
  });

  it("denies when user has no membership", async () => {
    const { userId, teamId, clubSlug } = await seedWithSlug();
    const d = await resolveTeamPageAccess(userId, clubSlug, teamId, "viewer");
    expect(d.kind).toBe("denied");
  });

  it("grants when team-only-admin accesses own team (was broken pre-fix)", async () => {
    const { userId, teamId, clubSlug } = await seedWithSlug();
    await db.insert(teamMemberships).values({ userId, teamId, role: "admin" });
    const d = await resolveTeamPageAccess(userId, clubSlug, teamId, "viewer");
    expect(d.kind).toBe("granted");
    if (d.kind !== "granted") return;
    expect(d.access.scope).toBe("team");
    expect(d.club.slug).toBe(clubSlug);
  });

  it("denies when team-only-admin tries to access sibling team", async () => {
    const { userId, teamId, otherTeamId, clubSlug } = await seedWithSlug();
    await db.insert(teamMemberships).values({ userId, teamId, role: "admin" });
    const d = await resolveTeamPageAccess(userId, clubSlug, otherTeamId, "viewer");
    expect(d.kind).toBe("denied");
  });

  it("grants team-admin level on team-settings (HIGH-2 fix)", async () => {
    const { userId, teamId, clubSlug } = await seedWithSlug();
    await db.insert(teamMemberships).values({ userId, teamId, role: "admin" });
    const d = await resolveTeamPageAccess(userId, clubSlug, teamId, "admin");
    expect(d.kind).toBe("granted");
  });

  it("denies team-viewer when admin level is required", async () => {
    const { userId, teamId, clubSlug } = await seedWithSlug();
    await db.insert(teamMemberships).values({ userId, teamId, role: "viewer" });
    const d = await resolveTeamPageAccess(userId, clubSlug, teamId, "admin");
    expect(d.kind).toBe("denied");
  });

  it("grants club-admin access to any vereinsgeführt team in the club", async () => {
    const { userId, clubId, teamId, otherTeamId, clubSlug } = await seedWithSlug();
    await db.insert(clubMemberships).values({ userId, clubId, role: "admin" });
    await grantVereinsLizenz(clubId, teamId);
    await grantVereinsLizenz(clubId, otherTeamId);
    const d1 = await resolveTeamPageAccess(userId, clubSlug, teamId, "admin");
    const d2 = await resolveTeamPageAccess(userId, clubSlug, otherTeamId, "admin");
    expect(d1.kind).toBe("granted");
    expect(d2.kind).toBe("granted");
  });

  // A5: nach einem Lizenz-Transfer navigiert der Lizenz-Verein-Admin das Team
  // unter SEINEM Slug (der Vereins-Layout-Guard würde ihn unter dem Alt-
  // Container-Slug rauswerfen). Der Alt-Container-Slug leitet ihn dorthin um.
  it("grants the licensing club's admin under the LICENSING club's slug (no redirect)", async () => {
    const { clubId: containerId, teamId } = await seedWithSlug();
    const { clubB, adminB } = await seedLicensingClub();
    const [bClub] = await db
      .select({ slug: clubs.slug })
      .from(clubs)
      .where(eq(clubs.id, clubB))
      .limit(1);
    await setLicensedUnder(teamId, clubB);
    await grantVereinsLizenz(clubB, teamId);
    void containerId;

    const d = await resolveTeamPageAccess(adminB, bClub!.slug, teamId, "admin");
    expect(d.kind).toBe("granted");
    if (d.kind !== "granted") return;
    expect(d.access.scope).toBe("club");
    expect(d.club.slug).toBe(bClub!.slug);
  });

  it("redirects the licensing club's admin from the old container slug to their own", async () => {
    const { clubSlug: containerSlug, teamId } = await seedWithSlug();
    const { clubB, adminB } = await seedLicensingClub();
    const [bClub] = await db
      .select({ slug: clubs.slug })
      .from(clubs)
      .where(eq(clubs.id, clubB))
      .limit(1);
    await setLicensedUnder(teamId, clubB);
    await grantVereinsLizenz(clubB, teamId);

    const d = await resolveTeamPageAccess(adminB, containerSlug, teamId, "viewer");
    expect(d.kind).toBe("redirect-slug");
    if (d.kind !== "redirect-slug") return;
    expect(d.correctSlug).toBe(bClub!.slug);
  });

  it("owner keeps team-scope access under the CONTAINER slug after transfer", async () => {
    const { userId: owner, clubSlug: containerSlug, teamId } = await seedWithSlug();
    await db.insert(teamMemberships).values({ userId: owner, teamId, role: "admin" });
    const { clubB } = await seedLicensingClub();
    await setLicensedUnder(teamId, clubB);
    await grantVereinsLizenz(clubB, teamId);

    const d = await resolveTeamPageAccess(owner, containerSlug, teamId, "admin");
    expect(d.kind).toBe("granted");
    if (d.kind !== "granted") return;
    expect(d.access.scope).toBe("team");
    expect(d.club.slug).toBe(containerSlug);
  });

  it("redirects to correct slug when URL slug does not match team's club", async () => {
    const { userId, teamId } = await seedWithSlug();
    await db.insert(teamMemberships).values({ userId, teamId, role: "admin" });
    const d = await resolveTeamPageAccess(userId, "wrong-slug", teamId, "viewer");
    expect(d.kind).toBe("redirect-slug");
    if (d.kind === "redirect-slug") {
      expect(d.correctSlug).toMatch(/^c-/); // seed verwendet "c-{cuid-prefix}"
    }
  });

  it("denies when team does not exist (no club leak)", async () => {
    const userId = createId();
    await db.insert(users).values({
      id: userId,
      email: `t-${userId}@kickpact.local`,
      emailVerified: true,
      name: "X",
      createdAt: new Date(),
      updatedAt: new Date()
    });
    const d = await resolveTeamPageAccess(userId, "any-slug", "nonexistent-team", "viewer");
    expect(d.kind).toBe("denied");
  });
});
