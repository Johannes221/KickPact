/**
 * W3 (Saison-Features 2026-06-12) — Tenancy-Gates der Builder-Simulation.
 *
 * `simulateDraftRules` darf NUR über einen gültigen Einladungs-Token an
 * Team-Daten kommen (gleiche Linie wie createPledge): die teamId stammt aus
 * der Einladung, nie vom Client → ein fremdes Team ohne Token ist
 * unerreichbar; abgelaufene/zurückgezogene Tokens liefern { ok: false }.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createId } from "@paralleldrive/cuid2";

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "u_sim", email: "sim@example.com" })
}));

import { db } from "@/lib/db/client";
import { users, clubs, teams, sponsorInvitations } from "@/lib/db/schema";
import { matches } from "@/lib/db/schema/matches";
import { resetTestDb } from "../setup/db";
import { simulateDraftRules } from "@/app/(sponsor)/sponsor/pledge/new/_actions/simulate-draft";

const CLUB_NAME = "Sportfreunde Testkirchen";
const IN_30_DAYS = () => new Date(Date.now() + 30 * 24 * 3600 * 1000);

async function seedTeamWithInvite(opts?: {
  status?: "pending" | "revoked" | "used";
  expiresAt?: Date;
}) {
  await db.insert(users).values({ id: "u_sim", email: "sim@example.com" });
  const [club] = await db
    .insert(clubs)
    .values({
      slug: `c-${createId().slice(0, 8)}`,
      name: CLUB_NAME,
      fussballdeVereinId: createId()
    })
    .returning({ id: clubs.id });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: club.id,
      name: "1. Herren",
      saison: "2627",
      fussballdeTeamId: createId(),
      isActive: true
    })
    .returning({ id: teams.id });
  const token = `tok_${createId()}`;
  await db.insert(sponsorInvitations).values({
    token,
    kind: "sponsor",
    teamId: team.id,
    createdByUserId: "u_sim",
    status: opts?.status ?? "pending",
    expiresAt: opts?.expiresAt ?? IN_30_DAYS()
  });
  // Ein Vorsaison-Heimsieg 2:0 (results_only) — genug für ein Ergebnis > 0.
  await db.insert(matches).values({
    teamId: team.id,
    fussballdeSpielId: createId(),
    datum: new Date("2025-09-14T15:00:00"),
    heimName: CLUB_NAME,
    gastName: "SV Gegner",
    ergebnisHeim: 2,
    ergebnisGast: 0,
    status: "finished"
  });
  return { teamId: team.id, token };
}

const RULES = [
  { triggerType: "goal_total" as const, amountEur: 1, params: {} },
  { triggerType: "win" as const, amountEur: 5, params: {} }
];

describe("simulateDraftRules (integration)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("liefert die Vorsaison-Simulation für einen gültigen Invite-Token", async () => {
    const { token } = await seedTeamWithInvite();
    const res = await simulateDraftRules({ invitationToken: token, rules: RULES });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.prevSaison).toBe("2526");
    expect(res.prevSaisonLabel).toBe("25/26");
    expect(res.result.matchCount).toBe(1);
    // 2 Tore × 1 € + 1 Sieg × 5 € = 7 €.
    expect(res.result.totalCents).toBe(700);
  });

  it("fremdes Team ohne gültigen Token → { ok: false } (Token existiert nicht)", async () => {
    await seedTeamWithInvite();
    const res = await simulateDraftRules({
      invitationToken: "tok_fremd_oder_geraten",
      rules: RULES
    });
    expect(res).toMatchObject({ ok: false });
  });

  it("zurückgezogener Token → { ok: false }", async () => {
    const { token } = await seedTeamWithInvite({ status: "revoked" });
    const res = await simulateDraftRules({ invitationToken: token, rules: RULES });
    expect(res).toMatchObject({ ok: false });
  });

  it("abgelaufener Token → { ok: false }", async () => {
    const { token } = await seedTeamWithInvite({
      expiresAt: new Date(Date.now() - 1000)
    });
    const res = await simulateDraftRules({ invitationToken: token, rules: RULES });
    expect(res).toMatchObject({ ok: false });
  });

  it("ungültige Regel-Daten → { ok: false }", async () => {
    const { token } = await seedTeamWithInvite();
    const res = await simulateDraftRules({
      invitationToken: token,
      rules: [{ triggerType: "goal_total", amountEur: 0.01, params: {} }]
    });
    expect(res).toMatchObject({ ok: false });
  });
});
