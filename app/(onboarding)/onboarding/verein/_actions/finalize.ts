"use server";

import slugify from "slugify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clubs, teams, clubMemberships, subscriptions, teamLicenses } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth/session";
import { createInvitation, listInvitationsForTeam } from "@/lib/db/queries/invitations";

const finalizeSchema = z.object({
  verein: z.object({
    name: z.string(),
    vereinId: z.string(),
    slug: z.string()
  }),
  team: z.object({
    name: z.string(),
    teamId: z.string(),
    slug: z.string(),
    saison: z.string()
  }),
  stammdaten: z.object({
    contactName: z.string(),
    street: z.string(),
    zip: z.string(),
    city: z.string(),
    isSmallBusiness: z.boolean(),
    taxId: z.string().optional(),
    // IBAN beim Onboarding optional — Verein kann sie später ergänzen.
    iban: z.string().optional()
  }),
  plan: z.enum(["basic", "pro"])
});

export async function finalizeOnboarding(input: z.infer<typeof finalizeSchema>) {
  const user = await requireUser();
  const parsed = finalizeSchema.parse(input);

  // ── Idempotenz-Check ──────────────────────────────────────────────────────
  // Wenn die fussballde_verein_id schon existiert, ist das Onboarding bereits
  // durchgelaufen (z.B. Page-Reload nach erfolgreichem Speichern). Dann
  // einfach die vorhandenen Daten zurückliefern statt die DB-Transaktion
  // nochmal zu versuchen (würde an der Unique-Constraint crashen).
  if (parsed.verein.vereinId) {
    const [existing] = await db
      .select({ id: clubs.id, slug: clubs.slug })
      .from(clubs)
      .where(eq(clubs.fussballdeVereinId, parsed.verein.vereinId))
      .limit(1);

    if (existing) {
      // Membership prüfen — darf nur der Admin selbst zurückbekommen
      const [membership] = await db
        .select()
        .from(clubMemberships)
        .where(eq(clubMemberships.clubId, existing.id))
        .limit(1);

      if (!membership || membership.userId !== user.id) {
        throw new Error("Dieser Verein ist bereits bei KickPact registriert.");
      }

      // Team + Einladung holen
      const [team] = await db
        .select({ id: teams.id })
        .from(teams)
        .where(eq(teams.clubId, existing.id))
        .limit(1);

      if (!team) throw new Error("Verein gefunden, aber kein Team — bitte Support kontaktieren.");

      const existingInvitations = await listInvitationsForTeam(team.id);
      const pendingInv = existingInvitations.find((i) => i.status === "pending");
      const invitation = pendingInv ?? (await createInvitation({ teamId: team.id, createdByUserId: user.id }));

      return { clubSlug: existing.slug, teamId: team.id, invitationToken: invitation.token };
    }
  }

  // Slug aus Verein-Name (eindeutig) + 4-char-Suffix für Konflikt-Vermeidung
  const baseSlug = slugify(parsed.verein.name, { lower: true, strict: true, trim: true });
  const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

  const result = await db.transaction(async (tx) => {
    const [club] = await tx
      .insert(clubs)
      .values({
        slug,
        name: parsed.verein.name,
        ort: parsed.stammdaten.city,
        fussballdeVereinId: parsed.verein.vereinId,
        taxId: parsed.stammdaten.taxId || null,
        isSmallBusiness: parsed.stammdaten.isSmallBusiness,
        addressJson: {
          street: parsed.stammdaten.street,
          zip: parsed.stammdaten.zip,
          city: parsed.stammdaten.city,
          country: "DE"
        },
        iban: parsed.stammdaten.iban || null
      })
      .returning();

    await tx.insert(clubMemberships).values({
      userId: user.id,
      clubId: club.id,
      role: "admin"
    });

    const [team] = await tx
      .insert(teams)
      .values({
        clubId: club.id,
        name: parsed.team.name,
        saison: parsed.team.saison,
        fussballdeTeamId: parsed.team.teamId,
        fussballdeSlug: parsed.team.slug,
        isActive: true
      })
      .returning();

    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);

    await tx.insert(subscriptions).values({
      clubId: club.id,
      // NULL bis zum ersten echten Stripe-Checkout. createCheckoutSession
      // erzeugt den Customer lazy. Frühere Implementierung schrieb hier
      // einen "placeholder_<clubId>"-String, der dann an Stripe Checkout
      // weitergereicht wurde → 4xx, Onboarding broken. Siehe Audit 2026-05-24.
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      status: "trialing",
      trialEndsAt: trialEnd
    });

    await tx.insert(teamLicenses).values({
      subscriptionClubId: club.id,
      teamId: team.id,
      plan: parsed.plan,
      stripeSubscriptionItemId: null,
      status: "trialing"
    });

    return { club, team };
  });

  const invitation = await createInvitation({
    teamId: result.team.id,
    createdByUserId: user.id
  });

  return {
    clubSlug: result.club.slug,
    teamId: result.team.id,
    invitationToken: invitation.token
  };
}
