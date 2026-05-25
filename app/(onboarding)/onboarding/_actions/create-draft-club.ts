"use server";

import slugify from "slugify";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clubs,
  teams,
  clubMemberships,
  subscriptions,
  teamLicenses
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { createInvitation, listInvitationsForTeam } from "@/lib/db/queries/invitations";

const teamSchema = z.object({
  teamId: z.string(),
  teamSlug: z.string(),
  teamName: z.string(),
  saison: z.string()
});

const createDraftSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("mannschaft"),
    verein: z.object({
      name: z.string().min(1),
      vereinId: z.string().min(1)
    }),
    team: teamSchema
  }),
  z.object({
    role: z.literal("verein"),
    verein: z.object({
      name: z.string().min(1),
      vereinId: z.string().min(1)
    }),
    teams: z.array(teamSchema).min(1)
  })
]);

export type CreateDraftInput = z.infer<typeof createDraftSchema>;

export interface CreateDraftResult {
  clubId: string;
  clubSlug: string;
  /** Eine Invitation pro Team — Key ist die teamId aus dem Input. */
  teams: Array<{ teamId: string; invitationToken: string }>;
}

/**
 * Step 1 des neuen Onboarding-Wizards. Legt Club + Team(s) + Trial-Subscription +
 * Invitations in EINER Transaktion an. Idempotent: zweiter Aufruf für den gleichen
 * fussballdeVereinId vom selben User liefert den existierenden Draft zurück
 * (race-safe via pg_advisory_xact_lock auf vereinId-Hash).
 *
 * Plan-Defaults:
 *   - role=mannschaft → teamLicenses.plan = 'pro'  (Pro-Trial)
 *   - role=verein     → teamLicenses.plan = 'verein' (Vereinslizenz-Trial)
 *
 * `subscriptions.billingCycle = 'monthly'` ist Placeholder bis zum ersten echten
 * Stripe-Checkout (der setzt monthly/season/annual basierend auf User-Wahl im
 * Abo-Flow nach Trial-Ende).
 *
 * Nicht-Owner-Verein wird mit Fehler abgelehnt — wenn der Verein schon einem
 * anderen User gehört, kann dieser User nicht draft-anlegen (separate Workflow:
 * Beitritts-Anfrage via /verein/.../zugriff-anfragen).
 */
export async function createDraftClub(input: CreateDraftInput): Promise<CreateDraftResult> {
  const user = await requireUser();
  const parsed = createDraftSchema.parse(input);

  const teamList = parsed.role === "mannschaft" ? [parsed.team] : parsed.teams;
  const planForLicenses = parsed.role === "mannschaft" ? "pro" : "verein";

  // ── Fast-Path: existiert dieser Verein schon? ─────────────────────────────
  const [existingClub] = await db
    .select({
      id: clubs.id,
      slug: clubs.slug,
      onboardingStatus: clubs.onboardingStatus
    })
    .from(clubs)
    .where(eq(clubs.fussballdeVereinId, parsed.verein.vereinId))
    .limit(1);

  if (existingClub) {
    const [membership] = await db
      .select({ userId: clubMemberships.userId, role: clubMemberships.role })
      .from(clubMemberships)
      .where(eq(clubMemberships.clubId, existingClub.id))
      .limit(1);

    if (!membership || membership.userId !== user.id) {
      throw new Error("Dieser Verein ist bereits bei KickPact registriert.");
    }
    if (existingClub.onboardingStatus === "completed") {
      throw new Error("Dieser Verein ist bereits vollständig onboarded. Du gelangst über das Dashboard hin.");
    }
    // Selber User, immer noch Draft → idempotent zurückgeben.
    return await loadExistingDraft(existingClub.id, existingClub.slug, user.id);
  }

  const baseSlug = slugify(parsed.verein.name, { lower: true, strict: true, trim: true });
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 30);

  const result = await db.transaction(async (tx) => {
    // Advisory-Lock serialisiert concurrent createDraftClub-Calls für den
    // gleichen fussballdeVereinId. Re-Check unter Lock fängt Race ab.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${parsed.verein.vereinId}, 0))`
    );

    const [raced] = await tx
      .select({ id: clubs.id, slug: clubs.slug })
      .from(clubs)
      .where(eq(clubs.fussballdeVereinId, parsed.verein.vereinId))
      .limit(1);
    if (raced) {
      return { idempotent: true as const, clubId: raced.id, clubSlug: raced.slug, insertedTeamIds: [] };
    }

    const [club] = await tx
      .insert(clubs)
      .values({
        slug,
        name: parsed.verein.name,
        fussballdeVereinId: parsed.verein.vereinId,
        onboardingStatus: "draft",
        onboardingRole: parsed.role,
        onboardingStartedAt: new Date()
      })
      .returning({ id: clubs.id, slug: clubs.slug });

    await tx.insert(clubMemberships).values({
      userId: user.id,
      clubId: club.id,
      role: "admin"
    });

    await tx.insert(subscriptions).values({
      clubId: club.id,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      status: "trialing",
      billingCycle: "monthly",
      trialEndsAt: trialEnd
    });

    const insertedTeams = await tx
      .insert(teams)
      .values(
        teamList.map((t) => ({
          clubId: club.id,
          name: t.teamName,
          saison: t.saison,
          fussballdeTeamId: t.teamId,
          fussballdeSlug: t.teamSlug,
          isActive: true
        }))
      )
      .returning({ id: teams.id });

    await tx.insert(teamLicenses).values(
      insertedTeams.map((t) => ({
        subscriptionClubId: club.id,
        teamId: t.id,
        plan: planForLicenses as "pro" | "verein",
        stripeSubscriptionItemId: null,
        status: "trialing" as const
      }))
    );

    return {
      idempotent: false as const,
      clubId: club.id,
      clubSlug: club.slug,
      insertedTeamIds: insertedTeams.map((t) => t.id)
    };
  });

  // Idempotent-Pfad: existierenden Draft komplett zurückladen.
  if (result.idempotent) {
    return await loadExistingDraft(result.clubId, result.clubSlug, user.id);
  }

  // Frische Invitations pro Team (außerhalb der TX — schadet nicht, weil
  // Invitation-Tabelle keine FK auf den TX-Snapshot braucht).
  const invitations = await Promise.all(
    result.insertedTeamIds.map((teamId) =>
      createInvitation({ teamId, createdByUserId: user.id })
    )
  );

  return {
    clubId: result.clubId,
    clubSlug: result.clubSlug,
    teams: result.insertedTeamIds.map((teamId, i) => ({
      teamId,
      invitationToken: invitations[i].token
    }))
  };
}

async function loadExistingDraft(
  clubId: string,
  clubSlug: string,
  userId: string
): Promise<CreateDraftResult> {
  const teamRows = await db
    .select({ id: teams.id })
    .from(teams)
    .where(eq(teams.clubId, clubId));

  const teamsWithInvitations = await Promise.all(
    teamRows.map(async (t) => {
      const existing = await listInvitationsForTeam(t.id);
      const pending = existing.find((i) => i.status === "pending");
      const inv = pending ?? (await createInvitation({ teamId: t.id, createdByUserId: userId }));
      return { teamId: t.id, invitationToken: inv.token };
    })
  );

  return { clubId, clubSlug, teams: teamsWithInvitations };
}
