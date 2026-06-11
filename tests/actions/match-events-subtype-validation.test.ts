/**
 * B3 (Audit 2026-06-11 / Phase 4 Paket B): Spezialtor-Subtypen-Mirror.
 *
 * `addManualEvent` validiert `subtype` serverseitig gegen die single source of
 * truth (`lib/triggers/special-goals.ts`):
 *   - unbekannter spezial-Subtype (z.B. der alte hardcodete "volley") → {ok:false}
 *   - jeder Subtype aus SPECIAL_GOAL_SUBTYPES → Event wird gespeichert
 *   - karte: nur gelb/rot
 * Bestands-Events mit Alt-Subtypen werden NICHT angefasst (nur Neuanlage
 * validiert) — Anzeige-Fallback siehe specialGoalSubtypeLabel.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "u_sub", email: "sub@example.com" })
}));
vi.mock("@/lib/auth/scope", () => ({
  assertClubWriteAccess: vi.fn().mockResolvedValue(undefined)
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}));

import { users, clubs, teams, matches, matchEvents } from "@/lib/db/schema";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import { addManualEvent } from "@/lib/actions/match-events";
import { SPECIAL_GOAL_SUBTYPES } from "@/lib/triggers/special-goals";

async function seedMatch(): Promise<string> {
  const db = await getTestDb();
  await db.insert(users).values({ id: "u_sub", email: "sub@example.com" });
  await db.insert(clubs).values({ id: "c_sub", slug: "sub-fc", name: "Subtype FC" });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: "c_sub",
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: "TEAM_SUB",
      fussballdeSlug: "sub-fc-1",
      isActive: true
    })
    .returning();
  const [match] = await db
    .insert(matches)
    .values({
      teamId: team.id,
      fussballdeSpielId: "fs_sub_1",
      datum: new Date("2026-06-07T13:00:00Z"),
      heimName: "Subtype FC",
      gastName: "SV Gegner",
      ergebnisHeim: 2,
      ergebnisGast: 0,
      status: "finished"
    })
    .returning();
  return match.id;
}

describe.skipIf(isIntegrationDbDisabled)("addManualEvent Subtype-Validierung", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("lehnt unbekannte spezial-Subtypen ab (z.B. Alt-Subtype 'volley') — kein Event gespeichert", async () => {
    const db = await getTestDb();
    const matchId = await seedMatch();

    for (const bad of ["volley", "fernschuss", "sonstiges", "quatsch"]) {
      const res = await addManualEvent({
        matchId,
        minute: 10,
        type: "spezial",
        subtype: bad,
        side: "heim"
      });
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.message).toContain(bad);
    }
    expect(await db.select().from(matchEvents)).toHaveLength(0);
  });

  it("lehnt spezial OHNE Subtype ab", async () => {
    const matchId = await seedMatch();
    const res = await addManualEvent({
      matchId,
      minute: 10,
      type: "spezial",
      side: "heim"
    });
    expect(res.ok).toBe(false);
  });

  it("akzeptiert jeden Subtype aus SPECIAL_GOAL_SUBTYPES", async () => {
    const db = await getTestDb();
    const matchId = await seedMatch();

    for (const s of SPECIAL_GOAL_SUBTYPES) {
      const res = await addManualEvent({
        matchId,
        minute: 10,
        type: "spezial",
        subtype: s.value,
        side: "heim"
      });
      expect(res.ok).toBe(true);
    }
    const rows = await db
      .select()
      .from(matchEvents)
      .where(eq(matchEvents.matchId, matchId));
    expect(rows.map((r) => r.subtype).sort()).toEqual(
      SPECIAL_GOAL_SUBTYPES.map((s) => s.value).sort()
    );
  });

  it("karte: gelb/rot erlaubt, anderes abgelehnt", async () => {
    const matchId = await seedMatch();

    const gelb = await addManualEvent({
      matchId,
      minute: 33,
      type: "karte",
      subtype: "gelb",
      side: "heim"
    });
    expect(gelb.ok).toBe(true);

    const blau = await addManualEvent({
      matchId,
      minute: 34,
      type: "karte",
      subtype: "blau",
      side: "heim"
    });
    expect(blau.ok).toBe(false);
  });

  it("tor ohne subtype bleibt erlaubt", async () => {
    const matchId = await seedMatch();
    const res = await addManualEvent({
      matchId,
      minute: 50,
      type: "tor",
      side: "heim",
      playerName: "Max"
    });
    expect(res.ok).toBe(true);
  });
});
