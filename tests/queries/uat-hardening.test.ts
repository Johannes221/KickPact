/**
 * Regressionstests für die UAT-Härtung (2026-07-08):
 *  - markInvitationUsed: atomar (pending→used), zweite Einlösung → false
 *    (verhindert Doppel-Pledge aus einer Einladung).
 *  - anonymizePlayerMatchEvents: scrubbt die denormalisierte
 *    match_events.player_name-Kopie beim Opt-out (DSGVO Art. 21).
 *  - revokeClubMembership: atomarer Letzter-Admin-Schutz (Sole-Admin bleibt).
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  users,
  clubs,
  teams,
  players,
  matches,
  matchEvents,
  sponsorInvitations,
  clubMemberships
} from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import { markInvitationUsed } from "@/lib/db/queries/invitations";
import { anonymizePlayerMatchEvents } from "@/lib/db/queries/crawler";
import { revokeClubMembership } from "@/lib/db/queries/membership-requests";

describe.skipIf(isIntegrationDbDisabled)("UAT-Härtung", () => {
  beforeEach(async () => {
    await resetTestDb();
  });
  afterAll(async () => {
    await closeTestDb();
  });

  it("markInvitationUsed: atomar — zweite Einlösung liefert false (kein Doppel-Pledge)", async () => {
    const db = await getTestDb();
    await db.insert(users).values({ id: "u_inv", email: "inv@test.local" });
    await db.insert(clubs).values({ id: "c_inv", slug: "c-inv", name: "Club Inv" });
    await db.insert(teams).values({ id: "t_inv", clubId: "c_inv", name: "T", saison: "2526" });
    await db.insert(sponsorInvitations).values({
      token: "tok_inv",
      kind: "sponsor",
      teamId: "t_inv",
      createdByUserId: "u_inv",
      status: "pending",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });

    expect(await markInvitationUsed("tok_inv", "u_inv")).toBe(true);
    // Zweiter (paralleler) Versuch: bereits used → false.
    expect(await markInvitationUsed("tok_inv", "u_inv")).toBe(false);
  });

  it("anonymizePlayerMatchEvents: scrubbt match_events.player_name (FK + Alt-Zeile per Name)", async () => {
    const db = await getTestDb();
    await db.insert(clubs).values({ id: "c_an", slug: "c-an", name: "Club An" });
    await db.insert(teams).values({ id: "t_an", clubId: "c_an", name: "T", saison: "2526" });
    const [p] = await db
      .insert(players)
      .values({ teamId: "t_an", name: "Max Real" })
      .returning({ id: players.id });
    const [m] = await db
      .insert(matches)
      .values({
        teamId: "t_an",
        fussballdeSpielId: "AN001",
        datum: new Date("2025-09-01T15:00:00Z"),
        heimName: "H",
        gastName: "G",
        status: "finished"
      })
      .returning({ id: matches.id });
    // FK-verknüpftes Event + Alt-Zeile ohne player_id (nur Name).
    await db.insert(matchEvents).values([
      { matchId: m!.id, type: "tor", minute: 10, side: "heim", playerName: "Max Real", playerId: p!.id, source: "scraped" },
      { matchId: m!.id, type: "tor", minute: 20, side: "heim", playerName: "Max Real", playerId: null, source: "scraped" }
    ]);

    await anonymizePlayerMatchEvents(p!.id, { legacyName: "Max Real", teamId: "t_an" });

    const rows = await db.select().from(matchEvents).where(eq(matchEvents.matchId, m!.id));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.playerName === "Anonymisiert")).toBe(true);
  });

  it("revokeClubMembership: letzter Admin bleibt geschützt, vorletzter darf gehen", async () => {
    const db = await getTestDb();
    await db.insert(clubs).values({ id: "c_adm", slug: "c-adm", name: "Club Adm" });
    await db.insert(users).values([
      { id: "u_a1", email: "a1@test.local" },
      { id: "u_a2", email: "a2@test.local" }
    ]);
    await db.insert(clubMemberships).values([
      { userId: "u_a1", clubId: "c_adm", role: "admin" },
      { userId: "u_a2", clubId: "c_adm", role: "admin" }
    ]);

    // Einer von zwei Admins darf gehen.
    expect(await revokeClubMembership("c_adm", "u_a1")).toBe(true);
    // Der letzte verbleibende Admin ist geschützt → false, Row bleibt.
    expect(await revokeClubMembership("c_adm", "u_a2")).toBe(false);
    const left = await db
      .select()
      .from(clubMemberships)
      .where(eq(clubMemberships.clubId, "c_adm"));
    expect(left).toHaveLength(1);
    expect(left[0].userId).toBe("u_a2");
  });
});
