/**
 * B4 (Audit 2026-06-11 / Phase 4 Paket B): Mitglieder-Invite-Mail.
 *
 * Die Invite-Actions speicherten die E-Mail bisher nur — jetzt wird die
 * Einladung per Resend verschickt (Template team-einladung):
 *   - Mail-Client wird mit Empfänger + korrektem Invite-Link aufgerufen
 *   - Mail-Fehler ist NICHT fatal: Invite bleibt gültig, {ok:true, mailSent:false}
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn().mockResolvedValue({ id: "u_inv", email: "admin@example.com" })
}));

const assertClubAccessMock = vi.fn();
vi.mock("@/lib/auth/scope", () => ({
  assertClubAccess: (...args: unknown[]) => assertClubAccessMock(...args),
  canManageTeamMembers: vi.fn().mockResolvedValue(true)
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const sendMock = vi.fn();
vi.mock("@/lib/mail/client", () => ({
  resend: { emails: { send: (...args: unknown[]) => sendMock(...args) } },
  MAIL_FROM: "KickPact <test@kickpact.test>"
}));

import { users, clubs, teams } from "@/lib/db/schema";
import { sponsorInvitations } from "@/lib/db/schema/invitations";
import {
  closeTestDb,
  getTestDb,
  isIntegrationDbDisabled,
  resetTestDb
} from "../setup/integration-db";
import { inviteTeamMemberAction } from "@/app/(verein)/verein/[slug]/einstellungen/mitglieder/_actions/invite";
import { inviteTeamMemberAction as inviteTeamScopedAction } from "@/app/(verein)/verein/[slug]/mannschaft/[teamId]/einstellungen/mitglieder/_actions/invite";

async function seed() {
  const db = await getTestDb();
  await db.insert(users).values({ id: "u_inv", email: "admin@example.com" });
  await db.insert(clubs).values({ id: "c_inv", slug: "invite-fc", name: "Invite FC" });
  const [team] = await db
    .insert(teams)
    .values({
      clubId: "c_inv",
      name: "1. Herren",
      saison: "2526",
      fussballdeTeamId: "T_INV",
      fussballdeSlug: "invite-fc-1",
      isActive: true
    })
    .returning();
  assertClubAccessMock.mockResolvedValue({
    user: { id: "u_inv", email: "admin@example.com" },
    club: { id: "c_inv", slug: "invite-fc", name: "Invite FC" },
    role: "admin"
  });
  return team.id;
}

describe.skipIf(isIntegrationDbDisabled)("Mitglieder-Invite-Mail (B4)", () => {
  beforeEach(async () => {
    await resetTestDb();
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: "mail_1" }, error: null });
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("Club-Action: verschickt die Einladung mit korrektem Link an die E-Mail", async () => {
    await seed();

    const res = await inviteTeamMemberAction({
      clubSlug: "invite-fc",
      email: "neu@example.com",
      role: "trainer",
      teamId: null
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mailSent).toBe(true);

    expect(sendMock).toHaveBeenCalledTimes(1);
    const mail = sendMock.mock.calls[0][0] as {
      to: string;
      subject: string;
      html: string;
      text: string;
    };
    expect(mail.to).toBe("neu@example.com");
    expect(mail.html).toContain(res.inviteUrl);
    expect(mail.text).toContain(res.inviteUrl);
    expect(res.inviteUrl).toContain(`/team-einladung/${res.token}`);
  });

  it("Mail-Fehler ist nicht fatal: Invite bleibt gültig, mailSent=false", async () => {
    await seed();
    sendMock.mockRejectedValue(new Error("Resend down"));

    const res = await inviteTeamMemberAction({
      clubSlug: "invite-fc",
      email: "neu@example.com",
      role: "viewer",
      teamId: null
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mailSent).toBe(false);

    // Invite-Row existiert trotzdem (Copy-Link-Fallback).
    const db = await getTestDb();
    const [row] = await db
      .select()
      .from(sponsorInvitations)
      .where(eq(sponsorInvitations.token, res.token));
    expect(row).toBeDefined();
    expect(row.recipientEmail).toBe("neu@example.com");
  });

  it("Resend-API-Error (kein Throw) zählt ebenfalls als mailSent=false", async () => {
    await seed();
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "validation_error" }
    });

    const res = await inviteTeamMemberAction({
      clubSlug: "invite-fc",
      email: "neu@example.com",
      role: "trainer",
      teamId: null
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mailSent).toBe(false);
  });

  it("Team-scoped Action: verschickt ebenfalls mit korrektem Link", async () => {
    const teamId = await seed();

    const res = await inviteTeamScopedAction({
      clubSlug: "invite-fc",
      email: "team-admin@example.com",
      role: "admin",
      teamId
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.mailSent).toBe(true);
    const mail = sendMock.mock.calls[0][0] as { to: string; html: string };
    expect(mail.to).toBe("team-admin@example.com");
    expect(mail.html).toContain(res.inviteUrl);
  });
});
